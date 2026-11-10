import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8765",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.DREK_CHROMIUM
      ? { executablePath: process.env.DREK_CHROMIUM }
      : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      process.platform === "win32"
        ? "..\\.venv\\Scripts\\python.exe -m uvicorn backend.app:app --app-dir .. --host 127.0.0.1 --port 8765"
        : "../.venv/bin/python -m uvicorn backend.app:app --app-dir .. --host 127.0.0.1 --port 8765",
    url: "http://127.0.0.1:8765/api/health",
    reuseExistingServer: !process.env.CI,
  },
});
