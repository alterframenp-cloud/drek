import copy
import io
import json
import subprocess

import pytest
from PIL import Image, ImageChops, ImageDraw, ImageStat

from backend.app import ExportSettings
from backend.media import probe
from backend.timeline import Edit, LayerTiming, kept_ranges
from backend.tests.test_editor import client, video, load, wait, save, frame, png, settings


def layer_png(w, h, rectangle=None):
    image = Image.new("RGBA", (w,h))
    if rectangle:
        ImageDraw.Draw(image).rectangle(rectangle, fill="white")
    out = io.BytesIO(); image.save(out,format="PNG")
    return out.getvalue()


def layered_export(client, asset, params, images=None):
    w,h=asset["width"],asset["height"]
    layers = images or {"watermark":layer_png(w,h),"diagonal":layer_png(w,h)}
    for name in ["watermark","diagonal"]:
        if params["timing"][name]["transition"]=="radial" and name+"_intro" not in layers:
            layers[name+"_intro"]=layers[name]
    response=client.post("/api/exports",data={"video_id":asset["id"],"settings":json.dumps(params)},
                         files={name:(name+".png",data,"image/png") for name,data in layers.items()})
    assert response.status_code==202,response.text
    item=wait(client,"/api/exports/"+response.json()["id"])
    assert item["status"]=="ready",item
    return item


@pytest.mark.parametrize("transition",["none","fade","radial"])
def test_independent_entries_exits_and_transitions(client,video,tmp_path,transition):
    asset=load(client,video)
    params=ExportSettings.model_validate(settings()).model_dump()
    params["timing"]={
        "blur":dict(start=.6,end=1.5,transition=transition,duration=.3),
        "watermark":dict(start=.2,end=1.8,transition=transition,duration=.3),
        "diagonal":dict(start=1,end=None,transition=transition,duration=.3),
    }
    images={"watermark":layer_png(320,180,(280,150,319,179)),"diagonal":layer_png(320,180,(100,40,200,70))}
    output=save(client,layered_export(client,asset,params,images),tmp_path/(transition+".mp4"))
    # Before all entries, the source must remain unchanged, including its corners.
    assert sum(ImageStat.Stat(ImageChops.difference(frame(video,.1),frame(output,.1))).mean)/3 < 8
    assert min(frame(output,.8).getpixel((300,165)))>240
    assert min(frame(output,1.6).getpixel((150,55)))>240
    assert min(frame(output,1.9).getpixel((300,165)))<220  # watermark ended
    if transition!="none":
        middle=frame(output,.35).getpixel((300,165))
        assert min(middle)<230  # entry is visibly intermediate, not a hard switch


def test_user_example_starts_at_four_and_ten_seconds(client,tmp_path):
    source=tmp_path/"minute-example.mp4"
    subprocess.run(["ffmpeg","-v","error","-y","-f","lavfi","-i","testsrc2=size=320x180:rate=12:duration=12",
                    "-c:v","libx264","-threads","2",str(source)],check=True)
    asset=load(client,source)
    params=ExportSettings.model_validate(settings()).model_dump()
    params["timing"]={
        "blur":dict(start=4,end=None,transition="radial",duration=.6),
        "watermark":dict(start=0,end=None,transition="fade",duration=.4),
        "diagonal":dict(start=10,end=None,transition="radial",duration=.6),
    }
    images={"watermark":layer_png(320,180,(280,150,319,179)),"diagonal":layer_png(320,180,(100,40,200,70))}
    output=save(client,layered_export(client,asset,params,images),tmp_path/"example.mp4")
    assert min(frame(output,1).getpixel((300,165)))>240
    assert min(frame(output,9).getpixel((150,55)))<230
    assert min(frame(output,11).getpixel((150,55)))>240
    # Exclude the watermark when comparing video before the scheduled blur.
    assert sum(ImageStat.Stat(ImageChops.difference(frame(output,3).crop((0,0,260,140)),frame(source,3).crop((0,0,260,140)))).mean)/3<8
    # The radial reveal reaches the center before the top-left corner.
    center=ImageStat.Stat(ImageChops.difference(frame(output,4.2).crop((125,75,195,105)),frame(source,4.2).crop((125,75,195,105)))).mean
    corner=ImageStat.Stat(ImageChops.difference(frame(output,4.2).crop((0,0,25,25)),frame(source,4.2).crop((0,0,25,25)))).mean
    assert sum(center)>sum(corner)+5


@pytest.mark.parametrize("audio",[True,False])
def test_trim_and_middle_cut_preserve_content_and_audio(client,tmp_path,audio):
    source=tmp_path/"six-seconds.mp4"
    command=["ffmpeg","-v","error","-y","-f","lavfi","-i","testsrc2=size=160x90:rate=24:duration=6"]
    if audio:
        command += ["-f","lavfi","-i","sine=frequency=440:duration=6","-c:a","aac"]
    subprocess.run(command+["-c:v","libx264","-threads","2",str(source)],check=True)
    asset=load(client,source)
    params=ExportSettings.model_validate(settings(enabled=False)).model_dump()
    params["edit"]=dict(start=1,end=5,cuts=[dict(start=2,end=3)])
    job=layered_export(client,asset,params)
    assert job["duration"]==3
    output=save(client,job,tmp_path/"cut.mp4")
    info=probe(output)
    assert abs(info["duration"]-3)<.12
    assert info["has_audio"]==audio
    for out_time,in_time in [(.4,1.4),(1.4,3.4),(2.4,4.4)]:
        assert sum(ImageStat.Stat(ImageChops.difference(frame(output,out_time),frame(source,in_time))).mean)/3<10
    if audio:
        streams=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-of","json",str(output)]))["streams"]
        assert abs(float(streams[0]["start_time"])-float(streams[1]["start_time"]))<.08
        assert abs(float(streams[1]["duration"])-3)<.1


def test_invalid_times_and_empty_edits_are_rejected(client,video):
    asset=load(client,video)
    params=ExportSettings.model_validate(settings()).model_dump()
    for edit in [dict(start=1,end=.5,cuts=[]),dict(start=0,end=None,cuts=[dict(start=0,end=2)]),dict(start=0,end=None,cuts=[dict(start=1,end=3)])]:
        bad=copy.deepcopy(params);bad["edit"]=edit
        response=client.post("/api/exports",data={"video_id":asset["id"],"settings":json.dumps(bad)},files={"overlay":("overlay.png",png(320,180),"image/png")})
        assert response.status_code==400,response.text
    with pytest.raises(ValueError): LayerTiming(start=2,end=1)
    with pytest.raises(ValueError): LayerTiming(start=float("inf"))
    with pytest.raises(ValueError): Edit(start=float("nan"))


def test_overlapping_cuts_are_merged_and_trimmed():
    assert kept_ranges(10,dict(start=1,end=9,cuts=[dict(start=3,end=6),dict(start=2,end=4),dict(start=8,end=10)]))==[(1,2),(6,8)]
    assert kept_ranges(10,dict(start=0,end=None,cuts=[dict(start=2,end=3),dict(start=3,end=4)]))==[(0,2),(4,10)]


@pytest.mark.parametrize("edit,offset",[(dict(start=.5,end=None,cuts=[]),.5),(dict(start=0,end=1.5,cuts=[]),0)])
def test_beginning_or_end_only_cut(client,video,tmp_path,edit,offset):
    asset=load(client,video)
    params=ExportSettings.model_validate(settings(enabled=False)).model_dump();params["edit"]=edit
    output=save(client,layered_export(client,asset,params),tmp_path/"single-trim.mp4")
    assert abs(probe(output)["duration"]-1.5)<.1
    assert sum(ImageStat.Stat(ImageChops.difference(frame(output,.3),frame(video,.3+offset))).mean)/3<10


def test_timed_pngs_preserve_variable_frame_timestamps(client,video,tmp_path):
    source=tmp_path/"vfr-layers.mp4"
    subprocess.run(["ffmpeg","-v","error","-y","-i",str(video),"-vf","select='if(lt(n,12),not(mod(n,2)),1)'","-fps_mode","vfr","-c:v","libx264","-c:a","copy",str(source)],check=True)
    asset=load(client,source)
    params=ExportSettings.model_validate(settings(enabled=False)).model_dump()
    params["timing"]["diagonal"].update(start=.4,transition="fade",duration=.3)
    output=save(client,layered_export(client,asset,params),tmp_path/"vfr-output.mp4")
    def times(path):
        data=json.loads(subprocess.check_output(["ffprobe","-v","error","-select_streams","v:0","-show_frames","-show_entries","frame=best_effort_timestamp_time","-of","json",str(path)]))
        return [float(f["best_effort_timestamp_time"]) for f in data["frames"]]
    src,dst=times(source),times(output)
    assert len(src)==len(dst)
    assert max(abs(a-b) for a,b in zip(src,dst))<.001
