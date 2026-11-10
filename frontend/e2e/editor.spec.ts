import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const fixtureDir = path.resolve("../.local/e2e"),
  fixture = path.join(fixtureDir, "sample.mp4");
test.beforeAll(() => {
  mkdirSync(fixtureDir, { recursive: true });
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x274563:s=640x360:r=24:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    fixture,
  ]);
});
async function range(page: Page, label: string, value: number) {
  await page
    .getByRole("slider", { name: label, exact: true })
    .evaluate((element, n) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(element, String(n));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
}

test("complete local workflow, presets, persistence and real MP4", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Editor local", { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("editor-empty.png"),
    fullPage: true,
  });
  await page.getByLabel("Importar archivo de video").setInputFiles(fixture);
  await expect(
    page.getByLabel("Vista previa del video con efectos"),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Reproducir", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pausar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await range(page, "Posición de reproducción", 1.5);
  await page.getByRole("button", { name: "Gaussian", exact: true }).click();
  await range(page, "Intensidad", 65);
  await page
    .getByLabel("Texto de la marca", { exact: true })
    .fill("@Álbum_ & % [1]");
  await page
    .getByRole("combobox", { name: "Background", exact: true })
    .selectOption("white");
  await range(page, "Opacidad del fondo", 100);
  await range(page, "Margen horizontal", 0);
  await range(page, "Margen inferior", 0);
  await page
    .getByText("Tipografía, color y espaciado", { exact: true })
    .click();
  await range(page, "Esquinas redondeadas", 0);
  await page
    .getByLabel("Texto diagonal", { exact: true })
    .fill("REQUEST YOURS — ÁLBUM");
  await page.getByRole("button", { name: "Save New", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nombre del preset" })
    .fill("Mi identidad");
  await page
    .getByRole("button", { name: "Guardar preset", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Set as Default", exact: true })
    .click();
  await page.getByRole("button", { name: "Renombrar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nombre del preset" })
    .fill("Mi identidad final");
  await page
    .getByRole("button", { name: "Guardar preset", exact: true })
    .click();
  await range(page, "Tamaño diagonal", 12);
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await page
    .getByLabel("Texto diagonal", { exact: true })
    .fill("CAMBIO TEMPORAL");
  await expect(
    page.getByText("● Cambios sin guardar en el preset"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quick Export", exact: true }).click();
  await expect(page.getByLabel("Texto diagonal", { exact: true })).toHaveValue(
    "REQUEST YOURS — ÁLBUM",
  );
  await expect(
    page.getByText("Tu video está listo", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.screenshot({
    path: info.outputPath("editor-video.png"),
    fullPage: true,
  });
  const promise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Guardar MP4" }).click();
  const output = info.outputPath("edited.mp4");
  await (await promise).saveAs(output);
  const meta = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-of", "json", output],
      { encoding: "utf8" },
    ),
  );
  expect(meta.streams[0].codec_name).toBe("h264");
  expect(meta.streams[0].width).toBe(640);
  expect(meta.streams[1].codec_type).toBe("audio");
  const pixels = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    "1",
    "-i",
    output,
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "-",
  ]);
  expect([...pixels.subarray((640 * 360 - 1) * 3)].every((v) => v > 235)).toBe(
    true,
  );
  let white = 0;
  for (let y = 40; y < 290; y++)
    for (let x = 40; x < 600; x++) {
      const i = (y * 640 + x) * 3;
      if (pixels[i] > 230 && pixels[i + 1] > 230 && pixels[i + 2] > 230)
        white++;
    }
  expect(white).toBeGreaterThan(1000);
  await page.reload();
  await expect(page.getByLabel("Texto diagonal", { exact: true })).toHaveValue(
    "REQUEST YOURS — ÁLBUM",
  );
  await page.getByLabel("Importar archivo de video").setInputFiles(fixture);
  await expect(
    page.getByLabel("Vista previa del video con efectos"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Texto de la marca", { exact: true }),
  ).toHaveValue("@Álbum_ & % [1]");
  await page.getByLabel("Texto diagonal", { exact: true }).fill("ACTUAL");
  await page.getByRole("button", { name: "Export Video", exact: true }).click();
  await expect(
    page.getByText("Tu video está listo", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Load Preset", exact: true }).click();
  await expect(page.getByLabel("Texto diagonal", { exact: true })).toHaveValue(
    "REQUEST YOURS — ÁLBUM",
  );
  await page
    .getByRole("button", { name: "Eliminar preset", exact: true })
    .click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  expect(
    await page
      .getByRole("combobox", { name: "Preset", exact: true })
      .locator("option")
      .count(),
  ).toBe(1);
  expect(errors).toEqual([]);
});

test("mobile layout and invalid input", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Seleccionar video" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("editor-mobile.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Importar archivo de video")
    .setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("bad"),
    });
  await expect(page.getByRole("alert")).toContainText("MP4, MOV, MKV o WEBM");
});

test("long diagonal stays inside portrait and square preview/export", async ({
  page,
}, info) => {
  for (const [w, h] of [
    [180, 320],
    [240, 240],
  ]) {
    const source = path.join(fixtureDir, `portrait-${w}.mp4`);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x274563:s=${w}x${h}:r=15:d=1`,
      "-c:v",
      "libx264",
      source,
    ]);
    await page.goto("/");
    await page.getByLabel("Importar archivo de video").setInputFiles(source);
    await expect(
      page.getByLabel("Vista previa del video con efectos"),
    ).toBeVisible();
    await page.getByLabel("Texto de la marca", { exact: true }).fill("");
    await page
      .getByLabel("Texto diagonal", { exact: true })
      .fill("REQUEST YOURS — ESTE ES UN TEXTO MUCHO MÁS LARGO ÁLBUM 2026");
    await range(page, "Tamaño diagonal", 40);
    await page.waitForFunction(
      () =>
        document.querySelector("video")!.readyState >= 2 &&
        document.fonts.status === "loaded",
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const b = await page.locator(".video-stage canvas").evaluate((node) => {
      const c = node as HTMLCanvasElement,
        { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      let minX = c.width,
        maxX = 0,
        minY = c.height,
        maxY = 0,
        count = 0;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            count++;
          }
        }
      return { minX, maxX, minY, maxY, count };
    });
    expect(b.count).toBeGreaterThan(50);
    expect(b.minX).toBeGreaterThan(0);
    expect(b.minY).toBeGreaterThan(0);
    expect(b.maxX).toBeLessThan(w - 1);
    expect(b.maxY).toBeLessThan(h - 1);
    await page
      .getByRole("button", { name: "Export Video", exact: true })
      .click();
    await expect(
      page.getByText("Tu video está listo", { exact: true }),
    ).toBeVisible();
    const promise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Guardar MP4" }).click();
    const output = info.outputPath(`long-${w}.mp4`);
    await (await promise).saveAs(output);
    const pixels = execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      output,
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "-",
    ]);
    let count = 0,
      edge = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        if (pixels[i] > 230 && pixels[i + 1] > 230 && pixels[i + 2] > 230) {
          count++;
          if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge++;
        }
      }
    expect(count).toBeGreaterThan(50);
    expect(edge).toBe(0);
  }
});
