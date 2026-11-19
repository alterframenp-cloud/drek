export type Font = "Studio Sans" | "Studio Serif" | "Studio Mono";
export type LayerId = "blur" | "watermark" | "diagonal";
export interface LayerTiming {
  start: number;
  end: number | null;
  transition: "none" | "fade" | "radial";
  duration: number;
}
export type Timings = Record<LayerId, LayerTiming>;
export interface CutRange {
  start: number;
  end: number;
}
export interface Edit {
  start: number;
  end: number | null;
  cuts: CutRange[];
}
export const defaultTiming = (): LayerTiming => ({
  start: 0,
  end: null,
  transition: "radial",
  duration: 0.6,
});
export const legacyTimings = (): Timings => ({
  blur: { ...defaultTiming(), transition: "none" },
  watermark: { ...defaultTiming(), transition: "none" },
  diagonal: { ...defaultTiming(), transition: "none" },
});
export const emptyEdit = (): Edit => ({ start: 0, end: null, cuts: [] });
export interface TextStyle {
  enabled: boolean;
  text: string;
  font: Font;
  size: number;
  bold: boolean;
  color: string;
  opacity: number;
  outline: boolean;
  shadow: boolean;
}
export interface Watermark extends TextStyle {
  position: "left" | "right";
  background: "transparent" | "black" | "white";
  backgroundOpacity: number;
  autoContrast: boolean;
  paddingX: number;
  paddingY: number;
  radius: number;
  marginX: number;
  marginY: number;
}
export interface Diagonal extends TextStyle {
  autoAngle: boolean;
  angle: number;
  autoFit: boolean;
  x: number;
  y: number;
}
export interface Settings {
  timing: Timings;
  blur: {
    enabled: boolean;
    mode: "gaussian" | "pixelate";
    gaussian: number;
    pixelate: number;
  };
  watermark: Watermark;
  diagonal: Diagonal;
  resolution: "original" | "720" | "1080";
  quality: "standard" | "high";
}
export interface Preset {
  id: string;
  name: string;
  settings: Settings;
}
export interface PresetStore {
  version: 1;
  presets: Preset[];
  defaultId: string | null;
}
export interface VideoAsset {
  id: string;
  name: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  has_audio: boolean;
  size: number;
  status: string;
  progress: number;
  error?: string;
}
export interface Job {
  id: string;
  status: string;
  progress: number;
  error?: string;
}
export const defaults: Settings = {
  timing: {
    blur: defaultTiming(),
    watermark: defaultTiming(),
    diagonal: defaultTiming(),
  },
  blur: { enabled: true, mode: "pixelate", gaussian: 35, pixelate: 40 },
  watermark: {
    enabled: true,
    text: "@AnimationLover_",
    font: "Studio Sans",
    size: 3.2,
    bold: true,
    color: "#ffffff",
    opacity: 100,
    outline: false,
    shadow: false,
    position: "right",
    background: "black",
    backgroundOpacity: 80,
    autoContrast: true,
    paddingX: 1.2,
    paddingY: 0.7,
    radius: 0.5,
    marginX: 2,
    marginY: 2,
  },
  diagonal: {
    enabled: true,
    text: "REQUEST YOURS",
    font: "Studio Sans",
    size: 15,
    bold: true,
    color: "#ffffff",
    opacity: 100,
    outline: false,
    shadow: true,
    autoAngle: true,
    angle: -29.36,
    autoFit: true,
    x: 50,
    y: 50,
  },
  resolution: "original",
  quality: "high",
};
export const clone = <T>(v: T): T => structuredClone(v);
export const STORE_KEY = "drek.presets.v1";
export const initialStore = (): PresetStore => ({
  version: 1,
  defaultId: "animationlover",
  presets: [
    {
      id: "animationlover",
      name: "AnimationLover Default",
      settings: clone(defaults),
    },
  ],
});
export function validSettings(value: unknown): value is Settings {
  if (!value || typeof value !== "object") return false;
  const s = value as Settings;
  const num = (v: unknown, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  const bool = (v: unknown) => typeof v === "boolean";
  const time = (t: LayerTiming) =>
    t &&
    num(t.start, 0, Number.MAX_VALUE) &&
    (t.end === null || (num(t.end, 0, Number.MAX_VALUE) && t.end > t.start)) &&
    ["none", "fade", "radial"].includes(t.transition) &&
    num(t.duration, 0, 5);
  const text = (t: TextStyle) =>
    t &&
    bool(t.enabled) &&
    typeof t.text === "string" &&
    t.text.length <= 500 &&
    ["Studio Sans", "Studio Serif", "Studio Mono"].includes(t.font) &&
    num(t.size, 0.5, 40) &&
    bool(t.bold) &&
    /^#[0-9a-f]{6}$/i.test(t.color) &&
    num(t.opacity, 0, 100) &&
    bool(t.outline) &&
    bool(t.shadow);
  const w = s.watermark,
    d = s.diagonal,
    b = s.blur;
  return Boolean(
    s.timing &&
      ["blur", "watermark", "diagonal"].every((k) =>
        time(s.timing[k as LayerId]),
      ) &&
      b &&
      bool(b.enabled) &&
      ["gaussian", "pixelate"].includes(b.mode) &&
      num(b.gaussian, 0, 100) &&
      num(b.pixelate, 0, 100) &&
      text(w) &&
      text(d) &&
      ["left", "right"].includes(w.position) &&
      ["transparent", "black", "white"].includes(w.background) &&
      num(w.backgroundOpacity, 0, 100) &&
      bool(w.autoContrast) &&
      num(w.paddingX, 0, 10) &&
      num(w.paddingY, 0, 10) &&
      num(w.radius, 0, 10) &&
      num(w.marginX, 0, 45) &&
      num(w.marginY, 0, 45) &&
      bool(d.autoAngle) &&
      bool(d.autoFit) &&
      num(d.angle, -180, 180) &&
      num(d.x, 0, 100) &&
      num(d.y, 0, 100) &&
      ["original", "720", "1080"].includes(s.resolution) &&
      ["standard", "high"].includes(s.quality),
  );
}
export function readStore(): PresetStore {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return initialStore();
  const v = JSON.parse(raw) as PresetStore;
  // Preserve all saved styles and old constant visibility without resetting presets.
  if (v && Array.isArray(v.presets))
    for (const p of v.presets) {
      if (
        p.settings &&
        typeof p.settings === "object" &&
        !("timing" in p.settings)
      )
        p.settings = { ...(p.settings as Settings), timing: legacyTimings() };
    }
  if (
    !v ||
    v.version !== 1 ||
    !Array.isArray(v.presets) ||
    !v.presets.every(
      (p) =>
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        p.name.trim() &&
        validSettings(p.settings),
    )
  ) {
    throw new Error(
      "Los presets locales no son válidos. Se cargaron los iniciales sin sobrescribirlos.",
    );
  }
  return v;
}
