import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

export default async function globalSetup() {
  const e2eDir = path.dirname(fileURLToPath(import.meta.url));
  const apiDir = path.resolve(e2eDir, "../api");
  const dbPath = path.resolve(e2eDir, "../api/prisma/e2e.db");

  process.env.DATABASE_URL = `file:${dbPath}`;

  // Use correct npx binary on Windows vs Unix
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  // Ensure schema is applied to the E2E database
  console.log("[globalSetup] Pushing Prisma schema to E2E database...");
  execSync(`${npx} prisma db push --skip-generate`, {
    cwd: apiDir,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
  });

  // Seed the database with test data (seed.ts now cleans mutable tables first)
  console.log("[globalSetup] Seeding E2E database...");
  execSync(`${npx} tsx prisma/seed.ts`, {
    cwd: apiDir,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
  });

  console.log("[globalSetup] E2E database ready at", dbPath);
}
