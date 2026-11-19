"""FFmpeg operations; text is supplied as a transparent Canvas PNG."""
import json
import math
import os
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path
from .timeline import ramp, progress_expression, kept_ranges

from .timeline import image_filters, kept_ranges, progress_expression


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


def image_filters(timing, duration, intro=False):
    d = ramp(timing, duration)
    filters = ["format=rgba"]
    if intro and (timing["transition"] != "radial" or d <= 0):
        return "format=rgba,colorchannelmixer=aa=0"
    if timing["transition"] != "none" and d > 0:
        enter = f"fade=t=in:st={timing['start']:.9f}:d={d:.9f}:alpha=1"
        filters.append(enter)
        if intro:
            filters.append(f"fade=t=out:st={timing['start']:.9f}:d={d:.9f}:alpha=1")
        elif timing["transition"] == "radial":
            filters.append(enter)
        if timing["end"] is not None:
            filters.append(f"fade=t=out:st={timing['end']-d:.9f}:d={d:.9f}:alpha=1")
    return ",".join(filters)


def export_command(source, overlay, target, meta, settings):
    w, h = meta["width"], meta["height"]
    ow, oh = output_size(w, h, settings["resolution"])
    from .timeline import Edit, Timings
    timing = settings.get("timing") or Timings().model_dump()
    edit = settings.get("edit") or Edit().model_dump()
    kept = kept_ranges(meta["duration"], edit)
    command = base_command(source)
    graph = [f"[0:{meta['stream_index']}]scale={w}:{h},setsar=1,format=rgba[original]"]
    base = "original"
    blur = settings["blur"]
    value = blur[blur["mode"]]
    if blur["enabled"] and value > 0:
        graph.append("[original]split=2[clean][fx]")
        if blur["mode"] == "gaussian":
            effect = f"gblur=sigma={blur_sigma(w, h, value):.6f}:steps=3"
        else:
            pw, ph = pixel_size(w, h, value)
            effect = f"scale={pw}:{ph}:flags=neighbor,scale={w}:{h}:flags=neighbor"
        schedule = timing["blur"]
        d = ramp(schedule, meta["duration"])
        if schedule["transition"] == "radial" and d > 0:
            # Only evaluate the per-pixel radial mask during entrance/exit.
            # Native overlays copy the steady effect for the rest of the video.
            graph.append(f"[fx]{effect},split=2[transitionfx][steadyfx]")
            q = progress_expression(schedule, meta["duration"])
            mask = f"clip((({q})*1.15-hypot(X-W/2,Y-H/2)/(hypot(W,H)/2))/0.15,0,1)"
            windows = f"between(t,{schedule['start']:.9f},{schedule['start']+d:.9f})"
            steady = f"gte(t,{schedule['start']+d:.9f})"
            if schedule["end"] is not None:
                windows += f"+between(t,{schedule['end']-d:.9f},{schedule['end']:.9f})"
                steady += f"*lt(t,{schedule['end']-d:.9f})"
            graph.append(f"[clean][transitionfx]blend=all_expr='A+(B-A)*({mask})':enable='{windows}'[ramping]")
            graph.append(f"[ramping][steadyfx]overlay=0:0:format=auto:enable='{steady}'[base]")
        else:
            graph.append(f"[fx]{effect},{image_filters(schedule,meta['duration'])}[blurred]")
            gate = f"gte(t,{schedule['start']:.9f})"
            if schedule["end"] is not None:
                gate += f"*lt(t,{schedule['end']:.9f})"
            graph.append(f"[clean][blurred]overlay=0:0:format=auto:enable='{gate}'[base]")
        base = "base"
    if isinstance(overlay, dict):
        index = 1
        for layer in ["diagonal", "watermark"]:
            schedule = timing[layer]
            for intro in [True, False]:
                key = layer + ("_intro" if intro else "")
                if key not in overlay:
                    continue
                fps = meta["fps"] or 30
                command += ["-framerate", str(fps), "-threads", "1", "-i", str(overlay[key])]
                label = f"layer{index}"
                graph.append(f"[{index}:v]loop=loop=-1:size=1:start=0,setpts=N/({fps}*TB),trim=duration={meta['duration']},{image_filters(schedule, meta['duration'], intro)}[{label}]")
                gate = f"gte(t,{schedule['start']:.9f})"
                if schedule["end"] is not None:
                    gate += f"*lt(t,{schedule['end']:.9f})"
                graph.append(f"[{base}][{label}]overlay=0:0:format=auto:enable='{gate}'[composed{index}]")
                base = f"composed{index}"
                index += 1
    else:
        # Legacy clients supplied one already-composed transparent image.
        command += ["-i", str(overlay)]
        graph.append(f"[{base}][1:v]overlay=0:0:format=auto[composed]")
        base = "composed"

    audio = "0:a:0?"
    if kept != [(0, meta["duration"])]:
        count = len(kept)
        graph.append(f"[{base}]split={count}" + "".join(f"[v{i}]" for i in range(count)))
        if meta["has_audio"]:
            graph.append(f"[0:a:0]aresample=async=1:first_pts=0,asplit={count}" + "".join(f"[a{i}]" for i in range(count)))
        inputs = []
        for i, (start, end) in enumerate(kept):
            graph.append(f"[v{i}]trim=start={start:.9f}:end={end:.9f},setpts=PTS-STARTPTS[cutv{i}]")
            inputs.append(f"[cutv{i}]")
            if meta["has_audio"]:
                graph.append(f"[a{i}]atrim=start={start:.9f}:end={end:.9f},asetpts=PTS-STARTPTS[cuta{i}]")
                inputs.append(f"[cuta{i}]")
        graph.append("".join(inputs) + f"concat=n={count}:v=1:a={int(meta['has_audio'])}[cutvideo]" + ("[cutaudio]" if meta["has_audio"] else ""))
        base = "cutvideo"
        audio = "[cutaudio]" if meta["has_audio"] else None
    graph.append(f"[{base}]scale={ow}:{oh}:flags=lanczos,format=yuv420p[out]")
    command += ["-filter_complex_threads", "1", "-filter_complex", ";".join(graph), "-map", "[out]"]
    if audio:
        command += ["-map", audio]
    return command + encode_options(target, settings["quality"])
