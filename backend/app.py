import asyncio
import logging
import os
import shutil
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, ValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .media import executable, export_command, preview_command, probe

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(os.environ.get("DREK_CACHE_DIR", str(Path(tempfile.gettempdir()) / "drek-editor")))
assets, jobs, tasks = {}, {}, set()
workers = asyncio.Semaphore(1)
LOG = logging.getLogger("drek")


class Blur(BaseModel):
    enabled: bool = True
    mode: Literal["gaussian", "pixelate"] = "pixelate"
    gaussian: float = Field(default=35, ge=0, le=100)
    pixelate: float = Field(default=40, ge=0, le=100)


class ExportSettings(BaseModel):
    blur: Blur
    resolution: Literal["original", "720", "1080"] = "original"
    quality: Literal["standard", "high"] = "high"


def spawn(coro):
    task = asyncio.create_task(coro)
    tasks.add(task)
    task.add_done_callback(tasks.discard)


def terminate(item):
    item["cancelled"] = True
    process = item.get("process")
    if process and process.returncode is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass


@asynccontextmanager
async def lifespan(application):
    CACHE.mkdir(parents=True, exist_ok=True)
    session = Path(tempfile.mkdtemp(prefix="session-", dir=CACHE))
    application.state.session = session
    for old in CACHE.glob("session-*"):
        if old != session and old.is_dir() and time.time() - old.stat().st_mtime > 7 * 86400:
            shutil.rmtree(old, ignore_errors=True)
    try:
        yield
    finally:
        for item in [*assets.values(), *jobs.values()]:
            terminate(item)
        if tasks:
            await asyncio.gather(*list(tasks), return_exceptions=True)
        shutil.rmtree(session, ignore_errors=True)
        assets.clear()
        jobs.clear()


app = FastAPI(title="Drek", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])


@app.middleware("http")
async def local_only(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in {"http://localhost:8765", "http://127.0.0.1:8765", "http://localhost:5173", "http://127.0.0.1:5173"}:
        return JSONResponse({"detail": "Esta aplicación solo acepta solicitudes locales."}, status_code=403)
    return await call_next(request)


@app.get("/api/health")
async def health():
    try:
        return dict(status="ok", app="drek", ffmpeg=bool(executable("ffmpeg")), ffprobe=bool(executable("ffprobe")))
    except RuntimeError as exc:
        return JSONResponse({"status": "error", "detail": str(exc)}, status_code=503)


def public(item):
    private = {"source", "preview", "output", "overlay", "process", "directory"}
    return {k: v for k, v in item.items() if k not in private}


async def run_process(command, item):
    if item.get("cancelled"):
        item["status"] = "cancelled"
        return
    process = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    item["process"] = process

    async def errors():
        tail = b""
        while chunk := await process.stderr.read(8192):
            tail = (tail + chunk)[-6000:]
        return tail.decode(errors="replace")

    error_task = asyncio.create_task(errors())
    async for raw in process.stdout:
        line = raw.decode(errors="replace").strip()
        if line.startswith("out_time_us="):
            try:
                item["progress"] = min(99, max(0, round(int(line.split("=", 1)[1]) / 1_000_000 / item["duration"] * 100)))
            except ValueError:
                pass
    code = await process.wait()
    error = await error_task
    item.pop("process", None)
    if item.get("cancelled"):
        item["status"] = "cancelled"
    elif code:
        LOG.error("FFmpeg: %s", error)
        raise RuntimeError("FFmpeg no pudo procesar el video. Revisa el archivo y el espacio disponible. " + error[-1800:])
    else:
        item.update(status="ready", progress=100)


async def prepare_asset(item):
    try:
        async with workers:
            if item.get("cancelled"):
                return
            item["status"] = "probing"
            item.update(await asyncio.to_thread(probe, item["source"]))
            item["status"] = "processing"
            await run_process(preview_command(item["source"], item["preview"], item), item)
    except Exception as exc:
        item.update(status="error", error=str(exc))
    finally:
        if item.get("cancelled"):
            item["status"] = "cancelled"
            shutil.rmtree(item["directory"], ignore_errors=True)


@app.post("/api/videos", status_code=202)
async def upload_video(request: Request, file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".mp4", ".mov", ".mkv", ".webm"}:
        raise HTTPException(400, "Elige un archivo MP4, MOV, MKV o WEBM.")
    try:
        executable("ffmpeg")
        executable("ffprobe")
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    identity = uuid.uuid4().hex
    directory = request.app.state.session / identity
    directory.mkdir()
    source = directory / ("source" + suffix)
    size = 0
    try:
        with source.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                await asyncio.to_thread(output.write, chunk)
                size += len(chunk)
        if not size:
            raise HTTPException(400, "El archivo está vacío.")
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    finally:
        await file.close()
    item = dict(id=identity, name=Path(file.filename).name, status="queued", progress=0, source=source,
                directory=directory, preview=directory / "preview.mp4", duration=1, size=size)
    assets[identity] = item
    spawn(prepare_asset(item))
    return public(item)


def get_asset(identity):
    if identity not in assets:
        raise HTTPException(404, "El video ya no está disponible. Vuelve a importarlo.")
    return assets[identity]


@app.get("/api/videos/{identity}")
async def video_status(identity: str):
    return public(get_asset(identity))


@app.get("/api/videos/{identity}/preview")
async def preview(identity: str):
    asset = get_asset(identity)
    if asset["status"] != "ready":
        raise HTTPException(409, "La vista previa todavía no está lista.")
    return FileResponse(asset["preview"], media_type="video/mp4")


@app.delete("/api/videos/{identity}")
async def delete_video(identity: str):
    item = get_asset(identity)
    if any(j["video_id"] == identity and j["status"] in {"queued", "processing"} for j in jobs.values()):
        raise HTTPException(409, "Cancela o termina la exportación antes de quitar el video.")
    processing = item["status"] in {"processing", "probing"}
    terminate(item)
    item["status"] = "cancelled"
    if not processing:
        shutil.rmtree(item["directory"], ignore_errors=True)
    return {"status": "cancelled"}


async def render_job(item, asset, settings):
    try:
        async with workers:
            if item.get("cancelled"):
                return
            item["status"] = "processing"
            await run_process(export_command(asset["source"], item["overlay"], item["output"], asset, settings), item)
    except Exception as exc:
        item.update(status="error", error=str(exc))
    finally:
        item["overlay"].unlink(missing_ok=True)
        if item.get("cancelled"):
            item["status"] = "cancelled"
        if item["status"] != "ready":
            item["output"].unlink(missing_ok=True)


@app.post("/api/exports", status_code=202)
async def export_video(video_id: str = Form(...), settings: str = Form(...), overlay: UploadFile = File(...)):
    asset = get_asset(video_id)
    if asset["status"] != "ready":
        raise HTTPException(409, "Espera a que termine la importación.")
    if any(j["status"] in {"queued", "processing"} for j in jobs.values()):
        raise HTTPException(409, "Ya hay una exportación en curso.")
    try:
        parsed = ExportSettings.model_validate_json(settings).model_dump()
    except (ValueError, ValidationError) as exc:
        raise HTTPException(400, "Configuración de exportación inválida.") from exc
    identity = uuid.uuid4().hex
    layer = asset["directory"] / (identity + ".png")
    try:
        with layer.open("wb") as output:
            while chunk := await overlay.read(1024 * 1024):
                await asyncio.to_thread(output.write, chunk)
        with Image.open(layer) as image:
            if image.format != "PNG" or image.size != (asset["width"], asset["height"]) or image.mode != "RGBA":
                raise ValueError("Dimensiones o formato incorrectos.")
            image.verify()
    except (ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        layer.unlink(missing_ok=True)
        raise HTTPException(400, "Capa de texto PNG inválida.") from exc
    finally:
        await overlay.close()
    item = dict(id=identity, video_id=video_id, status="queued", progress=0, duration=asset["duration"],
                overlay=layer, output=asset["directory"] / (identity + ".mp4"))
    jobs[identity] = item
    spawn(render_job(item, asset, parsed))
    return public(item)


def get_job(identity):
    if identity not in jobs:
        raise HTTPException(404, "La exportación ya no está disponible.")
    return jobs[identity]


@app.get("/api/exports/{identity}")
async def job_status(identity: str):
    return public(get_job(identity))


@app.delete("/api/exports/{identity}")
async def cancel_export(identity: str):
    job = get_job(identity)
    if job["status"] in {"queued", "processing"}:
        terminate(job)
        job["status"] = "cancelled"
    return public(job)


@app.get("/api/exports/{identity}/download")
async def download(identity: str):
    job = get_job(identity)
    if job["status"] != "ready":
        raise HTTPException(409, "La exportación todavía no está lista.")
    if not job["output"].is_file():
        raise HTTPException(404, "El archivo temporal ya se eliminó. Exporta nuevamente.")
    name = Path(assets[job["video_id"]]["name"]).stem + "-edited.mp4"
    return FileResponse(job["output"], media_type="video/mp4", filename=name)


DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
