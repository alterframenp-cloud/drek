"""FFmpeg operations; text is supplied as a transparent Canvas PNG."""
import json
import math
import os
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path


def executable(name):
    found = shutil.which(os.environ.get(name.upper() + "_BINARY", name))
    if not found:
        raise RuntimeError(f"No se encontró {name}. Instala FFmpeg y agrega su carpeta bin al PATH.")
    return found


def probe(path: Path):
    result = subprocess.run([executable("ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                            capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise ValueError("El archivo no es un video válido o está dañado.")
    data = json.loads(result.stdout)
    video = next((s for s in data["streams"] if s["codec_type"] == "video" and not s.get("disposition", {}).get("attached_pic")), None)
    if not video:
        raise ValueError("El archivo no contiene una pista de video.")
    rotation = float(video.get("tags", {}).get("rotate", 0))
    for side in video.get("side_data_list", []):
        rotation = side.get("rotation", rotation)
    try:
        sar = float(Fraction(video.get("sample_aspect_ratio", "1:1").replace(":", "/")))
        if sar <= 0:
            sar = 1
    except (ValueError, ZeroDivisionError):
        sar = 1
    width, height = round(video["width"] * sar), video["height"]
    if abs(round(rotation)) % 180 == 90:
        width, height = height, width
    try:
        fps = float(Fraction(video.get("avg_frame_rate", "0/1")))
    except (ValueError, ZeroDivisionError):
        fps = 0
    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
    if min(width, height) < 2 or not math.isfinite(duration) or duration <= 0:
        raise ValueError("No se pudo determinar la resolución o duración del video.")
    return dict(width=width, height=height, fps=fps, duration=duration, rotation=rotation,
                stream_index=video["index"], codec=video["codec_name"],
                has_audio=any(s["codec_type"] == "audio" for s in data["streams"]))


def output_size(w, h, resolution):
    ratio = 1 if resolution == "original" else min(1, int(resolution) / min(w, h))
    return max(2, math.ceil(w * ratio / 2) * 2), max(2, math.ceil(h * ratio / 2) * 2)


def blur_sigma(w, h, value):
    return min(w, h) * .08 * (value / 100) ** 1.6


def pixel_size(w, h, value):
    cell = 1 + min(w, h) * .09 * (value / 100) ** 1.5
    return max(1, math.floor(w / cell + .5)), max(1, math.floor(h / cell + .5))


def base_command(source):
    return [executable("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "2", "-i", str(source)]


def encode_options(target, quality="high", preset="medium"):
    return ["-c:v", "libx264", "-preset", preset, "-crf", "18" if quality == "high" else "23",
            "-pix_fmt", "yuv420p", "-threads", "2", "-fps_mode", "vfr", "-c:a", "aac", "-b:a", "192k",
            "-metadata:s:v:0", "rotate=0", "-movflags", "+faststart", "-progress", "pipe:1", str(target)]


def preview_command(source, target, meta):
    ratio = min(1, 1280 / max(meta["width"], meta["height"]))
    w, h = [max(2, round(meta[k] * ratio / 2) * 2) for k in ("width", "height")]
    return base_command(source) + ["-map", f"0:{meta['stream_index']}", "-map", "0:a:0?", "-vf", f"scale={w}:{h},setsar=1"] + encode_options(target, preset="ultrafast")


def export_command(source, overlay, target, meta, settings):
    w, h = meta["width"], meta["height"]
    ow, oh = output_size(w, h, settings["resolution"])
    graph = f"[0:{meta['stream_index']}]scale={w}:{h},setsar=1,format=rgba"
    blur = settings["blur"]
    value = blur[blur["mode"]]
    if blur["enabled"] and value > 0:
        if blur["mode"] == "gaussian":
            graph += f",gblur=sigma={blur_sigma(w, h, value):.6f}:steps=3"
        else:
            pw, ph = pixel_size(w, h, value)
            graph += f",scale={pw}:{ph}:flags=neighbor,scale={w}:{h}:flags=neighbor"
    graph += f"[base];[base][1:v]overlay=0:0:format=auto,scale={ow}:{oh}:flags=lanczos,format=yuv420p[out]"
    return base_command(source) + ["-i", str(overlay), "-filter_complex_threads", "1", "-filter_complex", graph,
                                  "-map", "[out]", "-map", "0:a:0?"] + encode_options(target, settings["quality"])
