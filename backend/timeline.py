"""Validated original-time layer schedules and non-destructive video cuts."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class LayerTiming(BaseModel):
    start: float = Field(default=0, ge=0, allow_inf_nan=False)
    end: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    transition: Literal["none", "fade", "radial"] = "none"
    duration: float = Field(default=0.6, ge=0, le=5, allow_inf_nan=False)

    @model_validator(mode="after")
    def ordered(self):
        if self.end is not None and self.end <= self.start:
            raise ValueError("La salida de una capa debe ser posterior a su entrada.")
        return self


class Timings(BaseModel):
    blur: LayerTiming = Field(default_factory=LayerTiming)
    watermark: LayerTiming = Field(default_factory=LayerTiming)
    diagonal: LayerTiming = Field(default_factory=LayerTiming)


class Cut(BaseModel):
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start:
            raise ValueError("El final del corte debe ser posterior al inicio.")
        return self


class Edit(BaseModel):
    start: float = Field(default=0, ge=0, allow_inf_nan=False)
    end: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    cuts: list[Cut] = Field(default_factory=list)


def kept_ranges(duration: float, edit: dict) -> list[tuple[float, float]]:
    start, end = edit["start"], edit["end"] if edit["end"] is not None else duration
    if not 0 <= start < end <= duration + 0.001:
        raise ValueError("El inicio y final del video deben dejar un tramo dentro de su duración.")
    end = min(end, duration)
    cuts = sorted((max(start, c["start"]), min(end, c["end"])) for c in edit["cuts"])
    if any(c["end"] > duration + 0.001 for c in edit["cuts"]):
        raise ValueError("Un corte supera la duración del video.")
    kept, cursor = [], start
    for left, right in cuts:
        if right <= cursor or left >= end:
            continue
        if left > cursor:
            kept.append((cursor, left))
        cursor = max(cursor, right)
    if cursor < end:
        kept.append((cursor, end))
    if not kept:
        raise ValueError("Los recortes eliminan todo el video. Conserva al menos un tramo.")
    return kept


def ramp(timing: dict, duration: float) -> float:
    span = max(0, (timing["end"] if timing["end"] is not None else duration) - timing["start"])
    return min(timing["duration"], span / 2 if timing["end"] is not None else span)


def progress_expression(timing: dict, duration: float, variable="T") -> str:
    start, end = timing["start"], timing["end"]
    gate = f"gte({variable},{start:.9f})"
    if end is not None:
        gate += f"*lt({variable},{end:.9f})"
    d = ramp(timing, duration)
    if timing["transition"] == "none" or d <= 0:
        return gate
    expression = f"{gate}*clip(({variable}-{start:.9f})/{d:.9f},0,1)"
    if end is not None:
        expression += f"*clip(({end:.9f}-{variable})/{d:.9f},0,1)"
    return expression


def image_filters(timing: dict, duration: float, intro=False) -> str:
    filters = ["format=rgba"]
    d = ramp(timing, duration)
    if timing["transition"] != "none" and d > 0:
        fade = f"fade=t=in:st={timing['start']:.9f}:d={d:.9f}:alpha=1"
        filters.append(fade)
        if intro:
            filters.append(f"fade=t=out:st={timing['start']:.9f}:d={d:.9f}:alpha=1")
        elif timing["transition"] == "radial":
            filters.append(fade)
        if timing["end"] is not None:
            filters.append(f"fade=t=out:st={timing['end'] - d:.9f}:d={d:.9f}:alpha=1")
    return ",".join(filters)
