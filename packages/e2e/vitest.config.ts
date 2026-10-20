import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Config regression tests — Playwright specs run via `npm run e2e`
    include: ["playwright.config.test.ts", "render-blueprint.test.ts"],
  },
});
