import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Render blueprint contract test (TIR-339 / M2).
 *
 * render.yaml is the Option-A staging deploy definition the DevOps lane
 * imports into Render. A YAML parser is not part of the JS toolchain here,
 * so the invariants are asserted on the hand-authored text — the point is to
 * catch regressions in the deploy contract (missing devDeps guard, secrets
 * pattern, SPA/service-worker rules, MOCK_REDIS leakage), not YAML syntax.
 */

const blueprint = readFileSync(join(__dirname, "..", "..", "render.yaml"), "utf8");

describe("render.yaml staging blueprint (TIR-339 M2)", () => {
  it("defines the staging service pair", () => {
    expect(blueprint).toMatch(/^(\s*)- type: web/m);
    expect(blueprint).toContain("name: flyby-api-staging");
    expect(blueprint).toContain("name: flyby-web-staging");
    // No prod cutover in this file: prod flips only via M4 with QA sign-off.
    expect(blueprint).not.toMatch(/name:\s*flyby-api\s*$/m);
    expect(blueprint).not.toMatch(/name:\s*flyby-web\s*$/m);
  });

  it("api service boots the monorepo with the documented commands", () => {
    expect(blueprint).toContain("rootDir: packages/api");
    expect(blueprint).toContain("healthCheckPath: /api/health");
    expect(blueprint).toContain("npx prisma generate --schema prisma/deploy/schema.postgres.prisma");
    expect(blueprint).toContain(
      "npx prisma migrate deploy --schema prisma/deploy/schema.postgres.prisma && npx tsx prisma/seed.ts",
    );
    expect(blueprint).toContain("startCommand: node dist/server.js");
  });

  it("build commands keep devDependencies despite NODE_ENV=production", () => {
    // NODE_ENV=production at build time makes npm skip devDeps, which carry
    // prisma/tsx/tsc. Both services must force --include=dev.
    const buildCommands = blueprint.match(/buildCommand: .*/g) ?? [];
    expect(buildCommands.length).toBe(2);
    for (const cmd of buildCommands) {
      expect(cmd).toContain("--include=dev");
    }
  });

  it("secrets follow the dashboard pattern, never baked into git", () => {
    expect(blueprint).toMatch(/key: ADMIN_API_KEY\n\s+generateValue: true/);
    for (const key of ["DATABASE_URL", "REDIS_URL", "VITE_API_BASE_URL"]) {
      expect(blueprint).toMatch(new RegExp(`key: ${key}\\n\\s+sync: false`));
    }
  });

  it("never deploys with MOCK_REDIS set", () => {
    expect(blueprint).not.toMatch(/key:\s*MOCK_REDIS/);
  });

  it("web service serves the built PWA with SPA fallback and worker no-cache", () => {
    expect(blueprint).toContain("rootDir: packages/web");
    expect(blueprint).toContain("staticPublishPath: dist");
    expect(blueprint).toMatch(/type: rewrite\n\s+source: \/\*\n\s+destination: \/index\.html/);
    // The service worker must revalidate every load or updates never land.
    expect(blueprint).toMatch(/path: \/sw\.js\n\s+name: Cache-Control\n\s+value: no-cache/);
    expect(blueprint).toMatch(/path: \/assets\/\*\n\s+name: Cache-Control\n\s+value: public, max-age=31536000, immutable/);
  });
});
