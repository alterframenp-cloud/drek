import type { Settings, TextStyle } from "./model";
export const diagonalAngle = (w: number, h: number) =>
  (-Math.atan2(h, w) * 180) / Math.PI;
export const blurSigma = (w: number, h: number, v: number) =>
  Math.min(w, h) * 0.08 * (v / 100) ** 1.6;
export function pixelSize(w: number, h: number, v: number): [number, number] {
  const cell = 1 + Math.min(w, h) * 0.09 * (v / 100) ** 1.5;
  return [Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(h / cell))];
}
function font(c: CanvasRenderingContext2D, s: TextStyle, size: number) {
  c.font = `${s.bold ? 700 : 400} ${size}px "${s.font}"`;
}
function metrics(c: CanvasRenderingContext2D, text: string) {
  const m = c.measureText(text);
  return {
    left: m.actualBoundingBoxLeft,
    right: m.actualBoundingBoxRight,
    top: m.actualBoundingBoxAscent,
    bottom: m.actualBoundingBoxDescent,
    width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
    height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
  };
}
function paint(
  c: CanvasRenderingContext2D,
  s: TextStyle,
  color: string,
  x: number,
  y: number,
  unit: number,
) {
  c.fillStyle = color;
  c.lineJoin = "round";
  if (s.shadow) {
    c.shadowColor = "#000d";
    c.shadowBlur = unit * 0.5;
    c.shadowOffsetY = unit * 0.2;
  }
  if (s.outline) {
    c.strokeStyle = "#101114";
    c.lineWidth = unit * 0.3;
    c.strokeText(s.text, x, y);
  }
  c.fillText(s.text, x, y);
}
/** Source-resolution transparent raster used by preview AND FFmpeg. Sizes/padding
 * use % of the short side; positions/margins use % of the corresponding axis. */
export function renderOverlay(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  settings: Settings,
) {
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d")!,
    unit = Math.min(width, height) / 100,
    d = settings.diagonal;
  if (d.enabled && d.text.trim() && d.opacity > 0) {
    c.save();
    const angle =
      ((d.autoAngle ? diagonalAngle(width, height) : d.angle) * Math.PI) / 180;
    let size = unit * d.size;
    const edge = Math.max(unit, (d.shadow ? 1 : 0.2) * unit);
    const x = Math.max(edge, Math.min(width - edge, (width * d.x) / 100));
    const y = Math.max(edge, Math.min(height - edge, (height * d.y) / 100));
    font(c, d, size);
    let m = metrics(c, d.text);
    if (d.autoFit)
      for (let i = 0; i < 6; i++) {
        const bw =
          Math.abs(m.width * Math.cos(angle)) +
          Math.abs(m.height * Math.sin(angle));
        const bh =
          Math.abs(m.width * Math.sin(angle)) +
          Math.abs(m.height * Math.cos(angle));
        const scale = Math.min(
          1,
          (2 * (Math.min(x, width - x) - edge)) / Math.max(1, bw),
          (2 * (Math.min(y, height - y) - edge)) / Math.max(1, bh),
        );
        if (scale >= 0.999) break;
        size = Math.max(0.01, size * Math.max(0.001, scale));
        font(c, d, size);
        m = metrics(c, d.text);
      }
    c.globalAlpha = d.opacity / 100;
    c.translate(x, y);
    c.rotate(angle);
    paint(c, d, d.color, (m.left - m.right) / 2, (m.top - m.bottom) / 2, unit);
    c.restore();
  }
  const w = settings.watermark;
  if (w.enabled && w.text.trim()) {
    c.save();
    let size = unit * w.size;
    const effect = (w.shadow ? 1 : w.outline ? 0.2 : 0) * unit;
    const mx = (width * w.marginX) / 100,
      my = (height * w.marginY) / 100,
      maxW = width - 2 * mx,
      maxH = height - my;
    const px = Math.min(unit * w.paddingX + effect, maxW / 4),
      py = Math.min(unit * w.paddingY + effect, maxH / 4);
    font(c, w, size);
    let m = metrics(c, w.text);
    size *= Math.min(
      1,
      (maxW - px * 2) / Math.max(1, m.width),
      (maxH - py * 2) / Math.max(1, m.height),
    );
    font(c, w, Math.max(0.01, size));
    m = metrics(c, w.text);
    const bw = Math.min(maxW, m.width + px * 2),
      bh = Math.min(maxH, m.height + py * 2);
    const x = w.position === "left" ? mx : width - mx - bw,
      y = height - my - bh;
    if (w.background !== "transparent") {
      c.globalAlpha = w.backgroundOpacity / 100;
      c.fillStyle = w.background === "black" ? "#000" : "#fff";
      c.beginPath();
      c.roundRect(x, y, bw, bh, Math.min(w.radius * unit, bw / 2, bh / 2));
      c.fill();
    }
    const color =
      w.autoContrast && w.background !== "transparent"
        ? w.background === "black"
          ? "#fff"
          : "#000"
        : w.color;
    c.globalAlpha = w.opacity / 100;
    paint(c, w, color, x + px + m.left, y + py + m.top, unit);
    c.restore();
  }
  return canvas;
}
export function overlayBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("No se pudo generar la capa de texto.")),
      "image/png",
    ),
  );
}
