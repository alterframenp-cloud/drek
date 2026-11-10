"""Integration tests execute real FFmpeg, not a mock export."""
import io
import json
import subprocess
import time

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageChops, ImageDraw, ImageStat

from backend.app import app
from backend.media import blur_sigma, output_size, pixel_size, probe


@pytest.fixture
def client(tmp_path, monkeypatch):
    import backend.app as module
    monkeypatch.setattr(module, "CACHE", tmp_path / "cache")
    with TestClient(app) as connection:
        yield connection


@pytest.fixture(scope="module")
def video(tmp_path_factory):
    path = tmp_path_factory.mktemp("media") / "source.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=2",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(path)], check=True)
    return path


def wait(client, endpoint):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        item = client.get(endpoint).json()
        if item["status"] in {"ready", "error", "cancelled"}:
            return item
        time.sleep(.05)
    pytest.fail(f"Processing timed out: {endpoint}")


def load(client, source, name="clip.mp4"):
    with source.open("rb") as file:
        response = client.post("/api/videos", files={"file": (name, file, "video/mp4")})
    assert response.status_code == 202, response.text
    item = wait(client, "/api/videos/" + response.json()["id"])
    assert item["status"] == "ready", item
    return item


def png(w, h, rectangles=False):
    image = Image.new("RGBA", (w, h))
    if rectangles:
        draw = ImageDraw.Draw(image)
        draw.rectangle((15, 15, 100, 35), fill="white")
        draw.rectangle((w - 100, h - 30, w - 1, h - 1), fill="black")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def settings(mode="gaussian", enabled=True, resolution="original", intensity=80):
    return {"blur": {"enabled": enabled, "mode": mode, "gaussian": intensity, "pixelate": intensity}, "quality": "high", "resolution": resolution}


def export(client, asset, params, overlay):
    response = client.post("/api/exports", data={"video_id": asset["id"], "settings": json.dumps(params)}, files={"overlay": ("overlay.png", overlay, "image/png")})
    assert response.status_code == 202, response.text
    item = wait(client, "/api/exports/" + response.json()["id"])
    assert item["status"] == "ready", item
    return item


def save(client, job, path):
    response = client.get(f"/api/exports/{job['id']}/download")
    assert response.status_code == 200
    path.write_bytes(response.content)
    return path


def frame(path, seconds=.5):
    result = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(seconds), "-i", str(path), "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-threads", "1", "-"], check=True, capture_output=True)
    return Image.open(io.BytesIO(result.stdout)).convert("RGB")


@pytest.mark.parametrize("mode", ["gaussian", "pixelate"])
def test_effects_audio_and_range(client, video, tmp_path, mode):
    asset = load(client, video)
    assert (asset["width"], asset["height"], asset["fps"], asset["has_audio"]) == (320, 180, 24, True)
    response = client.get(f"/api/videos/{asset['id']}/preview", headers={"Range": "bytes=0-99"})
    assert response.status_code == 206 and len(response.content) == 100
    job = export(client, asset, settings(mode), png(320, 180, True))
    output = save(client, job, tmp_path / "out.mp4")
    meta = probe(output)
    assert (meta["width"], meta["height"], meta["fps"], meta["codec"], meta["has_audio"]) == (320, 180, 24, "h264", True)
    assert abs(meta["duration"] - 2) < .15
    streams = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)]))["streams"]
    assert abs(float(streams[0]["start_time"]) - float(streams[1]["start_time"])) < .08
    def gradient(image):
        pixels = image.convert("L").load()
        return sum(abs(pixels[x,y]-pixels[x-1,y]) + abs(pixels[x,y]-pixels[x,y-1]) for y in range(41,140) for x in range(111,210))
    for seconds in [.3, 1.5]:
        image = frame(output, seconds)
        assert min(image.getpixel((50,25))) > 240
        assert max(image.getpixel((319,179))) < 15
        assert gradient(image) < gradient(frame(video, seconds))


def test_validation_and_passthrough(client, video, tmp_path):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/health", headers={"Origin": "https://untrusted.example"}).status_code == 403
    assert client.get("/api/health", headers={"Host": "untrusted.example"}).status_code == 400
    assert client.post("/api/videos", files={"file": ("bad.exe", b"x")}).status_code == 400
    assert client.post("/api/videos", files={"file": ("empty.mp4", b"")}).status_code == 400
    bad = client.post("/api/videos", files={"file": ("bad.mkv", b"not video")}).json()
    assert wait(client, f"/api/videos/{bad['id']}")["status"] == "error"
    asset = load(client, video, "Álbum ' & % [1].mp4")
    assert client.post("/api/exports", data={"video_id": asset["id"], "settings": json.dumps(settings())}, files={"overlay": ("bad.png", png(10,10))}).status_code == 400
    invalid = settings(); invalid["blur"]["gaussian"] = 101
    assert client.post("/api/exports", data={"video_id": asset["id"], "settings": json.dumps(invalid)}, files={"overlay": ("ok.png", png(320,180))}).status_code == 400
    output = save(client, export(client, asset, settings(enabled=False), png(320,180)), tmp_path / "plain.mp4")
    assert sum(ImageStat.Stat(ImageChops.difference(frame(video),frame(output))).mean)/3 < 8


@pytest.mark.parametrize("size", [(180,320), (240,240)])
def test_vertical_square_webm(client, tmp_path, size):
    w,h = size; source = tmp_path / "source.webm"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size={w}x{h}:rate=15:duration=0.8", "-c:v", "libvpx-vp9", "-threads", "2", str(source)], check=True)
    asset = load(client, source, source.name)
    output = save(client, export(client, asset, settings("pixelate", resolution="720"), png(w,h)), tmp_path / "out.mp4")
    meta = probe(output)
    assert (meta["width"],meta["height"],meta["has_audio"]) == (w,h,False)


def test_cancel_cleanup(client, video):
    asset = load(client, video)
    job = client.post("/api/exports", data={"video_id": asset["id"], "settings": json.dumps(settings())}, files={"overlay": ("layer.png", png(320,180))}).json()
    assert client.delete(f"/api/exports/{job['id']}").json()["status"] == "cancelled"
    assert client.get(f"/api/exports/{job['id']}/download").status_code == 409
    assert client.delete(f"/api/videos/{asset['id']}").status_code == 200
    assert client.get(f"/api/videos/{asset['id']}/preview").status_code == 409


def test_normalized_geometry():
    assert output_size(1920,1080,"720") == (1280,720)
    assert output_size(2160,3840,"1080") == (1080,1920)
    assert output_size(1080,1080,"720") == (720,720)
    assert pixel_size(1920,1080,100) == (20,11)
    assert blur_sigma(3840,2160,100) == 2*blur_sigma(1920,1080,100)


@pytest.mark.parametrize("extension,codec", [("mov","mpeg4"),("mkv","ffv1")])
def test_mov_mkv(client, video, tmp_path, extension, codec):
    source = tmp_path / ("movie." + extension)
    subprocess.run(["ffmpeg","-v","error","-y","-i",str(video),"-c:v",codec,"-c:a","pcm_s16le",str(source)], check=True)
    asset = load(client,source,source.name)
    assert asset["width"] == 320 and asset["has_audio"]
    save(client,export(client,asset,settings(),png(320,180)),tmp_path/"out.mp4")


def test_rotation_and_sar(client,video,tmp_path):
    source = tmp_path/"rotated.mov"
    subprocess.run(["ffmpeg","-v","error","-y","-display_rotation:v:0","90","-i",str(video),"-c","copy",str(source)],check=True)
    asset=load(client,source,source.name)
    assert (asset["width"],asset["height"]) == (180,320)
    output=save(client,export(client,asset,settings(),png(180,320)),tmp_path/"out.mp4")
    meta=probe(output)
    assert (meta["width"],meta["height"],meta["rotation"]) == (180,320,0)
    source=tmp_path/"anamorphic.mkv"
    subprocess.run(["ffmpeg","-v","error","-y","-i",str(video),"-vf","setsar=2","-c:v","libx264",str(source)],check=True)
    asset=load(client,source,source.name)
    assert (asset["width"],asset["height"]) == (640,180)
    output=save(client,export(client,asset,settings(enabled=False),png(640,180)),tmp_path/"wide.mp4")
    assert (probe(output)["width"],probe(output)["height"]) == (640,180)


def test_real_resize_outputs(client,tmp_path):
    source=tmp_path/"large.mp4"
    subprocess.run(["ffmpeg","-v","error","-y","-f","lavfi","-i","color=c=blue:s=1600x1200:r=24:d=0.3","-c:v","libx264","-threads","2",str(source)],check=True)
    asset=load(client,source)
    for resolution,expected in [("720",(960,720)),("1080",(1440,1080))]:
        output=save(client,export(client,asset,settings(enabled=False,resolution=resolution),png(1600,1200)),tmp_path/(resolution+".mp4"))
        meta=probe(output)
        assert (meta["width"],meta["height"]) == expected


def test_variable_fps_timestamps(client,video,tmp_path):
    source=tmp_path/"vfr.mp4"
    subprocess.run(["ffmpeg","-v","error","-y","-i",str(video),"-vf","select='if(lt(n,12),not(mod(n,2)),1)'","-fps_mode","vfr","-c:v","libx264","-c:a","copy",str(source)],check=True)
    asset=load(client,source)
    output=save(client,export(client,asset,settings(enabled=False),png(320,180)),tmp_path/"out.mp4")
    def timestamps(path):
        data=json.loads(subprocess.check_output(["ffprobe","-v","error","-select_streams","v:0","-show_frames","-show_entries","frame=best_effort_timestamp_time","-of","json",str(path)]))
        return [float(f["best_effort_timestamp_time"]) for f in data["frames"]]
    src,dst=timestamps(source),timestamps(output)
    assert len(src)==len(dst)
    assert max(abs(a-b) for a,b in zip(src,dst)) < .001
