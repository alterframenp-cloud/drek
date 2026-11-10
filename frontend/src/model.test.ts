import { describe, expect, it } from "vitest";
import { clone, defaults, validSettings } from "./model";
import { blurSigma, diagonalAngle, pixelSize } from "./render";
describe("normalized editor model", () => {
  it("validates complete presets and rejects corrupt values", () => {
    expect(validSettings(defaults)).toBe(true);
    const bad = clone(defaults);
    bad.watermark.marginX = NaN;
    expect(validSettings(bad)).toBe(false);
    expect(validSettings({ blur: defaults.blur })).toBe(false);
    expect(
      validSettings({
        ...defaults,
        diagonal: { ...defaults.diagonal, text: "x".repeat(501) },
      }),
    ).toBe(false);
  });
  it("keeps temporary edits apart from a saved snapshot", () => {
    const saved = clone(defaults),
      edit = clone(saved);
    edit.watermark.text = "Temporal";
    edit.quality = "standard";
    expect(saved.watermark.text).toBe("@AnimationLover_");
    expect(saved.quality).toBe("high");
  });
  it("uses the actual ascending diagonal in every aspect ratio", () => {
    expect(diagonalAngle(1000, 1000)).toBeCloseTo(-45);
    expect(diagonalAngle(1920, 1080)).toBeCloseTo(-29.3578);
    expect(diagonalAngle(1080, 1920)).toBeCloseTo(-60.6422);
  });
  it("scales effects proportionally to video dimensions", () => {
    expect(blurSigma(1920, 1080, 0)).toBe(0);
    expect(blurSigma(3840, 2160, 100)).toBe(2 * blurSigma(1920, 1080, 100));
    expect(blurSigma(1920, 1080, 80)).toBeGreaterThan(
      blurSigma(1920, 1080, 20),
    );
    expect(pixelSize(1920, 1080, 100)).toEqual([20, 11]);
    expect(pixelSize(1080, 1920, 100)).toEqual([11, 20]);
  });
});
