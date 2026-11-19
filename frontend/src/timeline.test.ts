import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaults,
  clone,
  legacyTimings,
  readStore,
  validSettings,
} from "./model";
import { keptRanges, nextKeptTime, phase } from "./timeline";
afterEach(() => vi.unstubAllGlobals());
describe("layer schedules and non-destructive cuts", () => {
  it("has independent schedules and a bounded entrance and exit", () => {
    const t = { start: 4, end: 10, transition: "fade" as const, duration: 1 };
    expect(phase(t, 3.9, 60).opacity).toBe(0);
    expect(phase(t, 4, 60).opacity).toBe(0);
    expect(phase(t, 4.5, 60).opacity).toBe(0.5);
    expect(phase(t, 6, 60).opacity).toBe(1);
    expect(phase(t, 9.5, 60).opacity).toBe(0.5);
    expect(phase(t, 10, 60).opacity).toBe(0);
    expect(phase({ ...t, transition: "none" }, 4, 60).opacity).toBe(1);
  });
  it("short intervals do not overlap entrance and exit ramps", () => {
    const t = {
      start: 1,
      end: 1.2,
      transition: "radial" as const,
      duration: 3,
    };
    expect(phase(t, 1.1, 10).opacity).toBeCloseTo(1);
    expect(phase({ ...t, end: null }, 2, 10).opacity).toBeCloseTo(1 / 3);
  });
  it("keeps trim and middle cuts in original-time coordinates", () => {
    expect(
      keptRanges(60, {
        start: 2,
        end: 58,
        cuts: [
          { start: 10, end: 15 },
          { start: 13, end: 20 },
          { start: 25, end: 30 },
        ],
      }),
    ).toEqual([
      [2, 10],
      [20, 25],
      [30, 58],
    ]);
    expect(
      nextKeptTime(12, [
        [2, 10],
        [20, 25],
      ]),
    ).toBe(20);
    expect(
      nextKeptTime(8, [
        [2, 10],
        [20, 25],
      ]),
    ).toBe(8);
    expect(
      nextKeptTime(26, [
        [2, 10],
        [20, 25],
      ]),
    ).toBeNull();
  });
  it("rejects empty/invalid selections and invalid effect ranges", () => {
    expect(() =>
      keptRanges(10, { start: 0, end: null, cuts: [{ start: 0, end: 10 }] }),
    ).toThrow();
    expect(() => keptRanges(10, { start: 0, end: 12, cuts: [] })).toThrow();
    const s = clone(defaults);
    s.timing.diagonal.start = 10;
    s.timing.diagonal.end = 4;
    expect(validSettings(s)).toBe(false);
  });
  it("migrates existing presets without changing their styles or visibility", () => {
    const old = clone(defaults) as Partial<typeof defaults>;
    delete old.timing;
    old.watermark!.text = "Mi marca guardada";
    old.blur!.pixelate = 72;
    const storage = {
      getItem: () =>
        JSON.stringify({
          version: 1,
          defaultId: "old",
          presets: [{ id: "old", name: "Guardado", settings: old }],
        }),
      setItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", storage);
    const restored = readStore().presets[0].settings;
    expect(restored.watermark.text).toBe("Mi marca guardada");
    expect(restored.blur.pixelate).toBe(72);
    expect(restored.timing).toEqual(legacyTimings());
    expect(validSettings(restored)).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
