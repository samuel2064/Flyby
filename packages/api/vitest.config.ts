/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    env: {
      MOCK_REDIS: "1",
      // Dev-only admin key so the moderation compat suites run without a local
      // packages/api/.env (CI checkouts have none). Not a secret: the same
      // value is asserted literally inside tests/deploy-compat-qa.test.ts.
      ADMIN_API_KEY: "dev-admin-key-local-only",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./test-output/coverage",
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
});