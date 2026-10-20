import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Schema parity guard (TIR-339 M2).
 *
 * The monorepo carries two Prisma schemas:
 *   - prisma/schema.prisma                    (SQLite, local dev + test suite)
 *   - prisma/deploy/schema.postgres.prisma    (PostgreSQL, Render staging/prod)
 *
 * The deploy path is the one that will take over prod (Option A), so the two
 * model definitions must never drift. This test parses both files and asserts
 * the model sections are byte-identical apart from whitespace, plus that the
 * Postgres migration artifacts (lock file + baseline migration) exist and
 * declare the right provider.
 */

const prismaDir = join(__dirname, "..", "prisma");
const mainSchemaPath = join(prismaDir, "schema.prisma");
const deploySchemaPath = join(prismaDir, "deploy", "schema.postgres.prisma");

function readDatasourceProvider(schemaText: string): string {
  const m = schemaText.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("No datasource provider found in schema");
  return m[1];
}

function extractModels(schemaText: string): Map<string, string> {
  const models = new Map<string, string>();
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = modelRe.exec(schemaText)) !== null) {
    const name = match[1];
    const body = match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"))
      .join("\n");
    models.set(name, body);
  }
  return models;
}

describe("schema parity (SQLite dev vs PostgreSQL deploy)", () => {
  it("both schema files exist", () => {
    expect(existsSync(mainSchemaPath)).toBe(true);
    expect(existsSync(deploySchemaPath)).toBe(true);
  });

  it("providers are sqlite (dev) and postgresql (deploy)", () => {
    expect(readDatasourceProvider(readFileSync(mainSchemaPath, "utf8"))).toBe("sqlite");
    expect(readDatasourceProvider(readFileSync(deploySchemaPath, "utf8"))).toBe("postgresql");
  });

  it("model sets are identical between the two schemas", () => {
    const mainModels = extractModels(readFileSync(mainSchemaPath, "utf8"));
    const deployModels = extractModels(readFileSync(deploySchemaPath, "utf8"));

    const mainNames = [...mainModels.keys()].sort();
    const deployNames = [...deployModels.keys()].sort();
    expect(deployNames).toEqual(mainNames);
    expect(mainNames.length).toBeGreaterThan(0);
  });

  it("every model body is identical (fields, attributes, maps, indexes)", () => {
    const mainModels = extractModels(readFileSync(mainSchemaPath, "utf8"));
    const deployModels = extractModels(readFileSync(deploySchemaPath, "utf8"));

    for (const [name, mainBody] of mainModels) {
      expect(deployModels.get(name), `model ${name} must exist in the deploy schema`).toBeDefined();
      expect(deployModels.get(name), `model ${name} drifted between dev and deploy schemas`).toBe(mainBody);
    }
  });

  it("deploy migrations dir is a valid postgres migration target", () => {
    const lockPath = join(prismaDir, "deploy", "migrations", "migration_lock.toml");
    expect(existsSync(lockPath), "migration_lock.toml missing for deploy migrations").toBe(true);
    expect(readFileSync(lockPath, "utf8")).toMatch(/provider\s*=\s*"postgresql"/);

    const initDir = join(prismaDir, "deploy", "migrations", "20261019000000_init");
    const initSql = join(initDir, "migration.sql");
    expect(existsSync(initSql), "baseline migration.sql missing").toBe(true);

    const sql = readFileSync(initSql, "utf8");
    const expectedTables = [
      "users",
      "airports",
      "checkpoints",
      "wait_times",
      "report_flags",
      "notification_subscriptions",
      "notification_logs",
      "notification_preferences",
    ];
    for (const table of expectedTables) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
    // FK delete semantics the app relies on.
    expect(sql).toContain('REFERENCES "airports"("id")');
    expect(sql).toContain('REFERENCES "checkpoints"("id")');
    // The traffic-math index (checkpointId, reportedAt) must exist on wait_times.
    expect(sql).toContain('CREATE INDEX "wait_times_checkpoint_id_reported_at_idx"');
  });
});
