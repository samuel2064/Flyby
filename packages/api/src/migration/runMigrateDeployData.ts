/**
 * CLI entry for the deploy -> monorepo data migration (TIR-339 condition 5).
 *
 * Usage:
 *   DEPLOY_DATABASE_URL=postgresql://<deploy pg> \
 *   DATABASE_URL=postgresql://<target pg> \
 *   npx tsx src/migration/runMigrateDeployData.ts
 *
 * Preview (no target connection, nothing written anywhere):
 *   DEPLOY_DATABASE_URL=postgresql://<deploy pg> \
 *   npx tsx src/migration/runMigrateDeployData.ts --dry-run
 *
 *   The dry-run report is the projection onto an EMPTY target: every row that
 *   would be written on a first real run shows as migrated. Use it to review
 *   counts/warnings/per-airport parity (and to sanity-check the deploy
 *   schema dump) before the staging PG even exists - the deploy side is only
 *   ever read.
 *
 * Guards:
 *   - Both URLs (real run) must be postgresql:// (never run against SQLite dev).
 *   - The Prisma client must be generated from the PG deploy schema.
 *   - The run is idempotent; re-running against a converged target reports
 *     the same counts and writes nothing new.
 *
 * Exit codes: 0 = migration ran (skips are reported, not fatal);
 *             1 = configuration or IO error.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaMigrationSink } from "./prismaMigrationSink";
import { PgDeploySourceReader } from "./pgDeploySource";
import { DryRunSink, migrateDeployData, type MigrationReport } from "./migrateDeployData";

function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

function logSummary(report: MigrationReport, dryRun: boolean): void {
  const anySkip =
    report.airports.skipped > 0 ||
    report.checkpoints.skipped > 0 ||
    report.waitReports.skipped > 0;
  console.error(
    `[migrate-deploy-data] done${dryRun ? " (DRY RUN - nothing was written)" : ""}: ` +
      `airports ${report.airports.migrated}/${report.airports.total}, ` +
      `checkpoints ${report.checkpoints.migrated}/${report.checkpoints.total}, ` +
      `waitReports ${report.waitReports.migrated}/${report.waitReports.total}` +
      (anySkip ? " (skips present - review the report above)" : ""),
  );
}

async function runReal(deployUrl: string, targetUrl: string): Promise<number> {
  const reader = new PgDeploySourceReader(deployUrl);
  // Bind the sink to the VALIDATED target URL, not the ambient DATABASE_URL,
  // so what the guard checked is exactly what gets written to.
  const sink = new PrismaMigrationSink(new PrismaClient({ datasources: { db: { url: targetUrl } } }));
  try {
    console.error("[migrate-deploy-data] reading deploy database...");
    const report = await migrateDeployData(reader, sink);
    console.log(JSON.stringify(report, null, 2));
    logSummary(report, false);
    return 0;
  } catch (err) {
    console.error("[migrate-deploy-data] FAILED:", err instanceof Error ? err.message : err);
    return 1;
  } finally {
    await reader.close();
    await sink.close();
  }
}

async function runDry(deployUrl: string): Promise<number> {
  const reader = new PgDeploySourceReader(deployUrl);
  try {
    console.error("[migrate-deploy-data] reading deploy database (dry run)...");
    const report = await migrateDeployData(reader, new DryRunSink());
    console.log(JSON.stringify({ ...report, dryRun: true }, null, 2));
    logSummary(report, true);
    return 0;
  } catch (err) {
    console.error("[migrate-deploy-data] FAILED:", err instanceof Error ? err.message : err);
    return 1;
  } finally {
    await reader.close();
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const deployUrl = process.env.DEPLOY_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;

  if (!deployUrl) {
    console.error(
      dryRun
        ? "DEPLOY_DATABASE_URL is required for --dry-run (no DATABASE_URL needed - nothing is written)."
        : "DEPLOY_DATABASE_URL and DATABASE_URL are both required.",
    );
    return 1;
  }
  if (!isPostgresUrl(deployUrl)) {
    console.error("DEPLOY_DATABASE_URL must be a postgresql:// URL (never run the migration against SQLite dev).");
    return 1;
  }

  if (dryRun) return runDry(deployUrl);

  const target = targetUrl;
  if (!target) {
    console.error("DEPLOY_DATABASE_URL and DATABASE_URL are both required.");
    return 1;
  }
  if (!isPostgresUrl(target)) {
    console.error("DATABASE_URL must be a postgresql:// URL (never run the migration against SQLite dev).");
    return 1;
  }
  return runReal(deployUrl, target);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[migrate-deploy-data] unhandled failure:", err);
    process.exit(1);
  });
