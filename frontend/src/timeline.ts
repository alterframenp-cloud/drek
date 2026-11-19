import type { Edit, LayerTiming } from "./model";

export function ramp(t: LayerTiming, duration: number): number {
  const span = Math.max(0, (t.end ?? duration) - t.start);
  return Math.min(t.duration, t.end === null ? span : span / 2);
}
export function phase(t: LayerTiming, seconds: number, duration: number) {
  if (seconds < t.start || (t.end !== null && seconds >= t.end))
    return { entry: 0, opacity: 0 };
  const d = ramp(t, duration);
  if (t.transition === "none" || d <= 0) return { entry: 1, opacity: 1 };
  const entry = Math.max(0, Math.min(1, (seconds - t.start) / d));
  const exit =
    t.end === null ? 1 : Math.max(0, Math.min(1, (t.end - seconds) / d));
  return { entry, opacity: entry * exit };
}
export function keptRanges(duration: number, edit: Edit): [number, number][] {
  const start = edit.start,
    end = edit.end ?? duration;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= end ||
    end > duration + 0.001
  )
    throw new Error(
      "El inicio y final del video deben dejar un tramo dentro de su duración.",
    );
  if (
    edit.cuts.some(
      (c) =>
        !Number.isFinite(c.start) ||
        !Number.isFinite(c.end) ||
        c.start < 0 ||
        c.end <= c.start ||
        c.end > duration + 0.001,
    )
  )
    throw new Error(
      "Revisa los cortes: cada final debe ser posterior a su inicio y estar dentro del video.",
    );
  const cuts = edit.cuts
    .map((c) => [Math.max(start, c.start), Math.min(end, c.end)])
    .sort((a, b) => a[0] - b[0]);
  const kept: [number, number][] = [];
  let cursor = start;
  for (const [left, right] of cuts) {
    if (right <= cursor || left >= end) continue;
    if (left > cursor) kept.push([cursor, left]);
    cursor = Math.max(cursor, right);
  }
  if (cursor < end) kept.push([cursor, Math.min(duration, end)]);
  if (!kept.length)
    throw new Error(
      "Los recortes eliminan todo el video. Conserva al menos un tramo.",
    );
  return kept;
}
export function nextKeptTime(
  seconds: number,
  ranges: [number, number][],
): number | null {
  for (const [start, end] of ranges) {
    if (seconds < start) return start;
    if (seconds < end) return seconds;
  }
  return null;
}
