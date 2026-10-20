/**
 * CLI entry for the deploy -> monorepo data migration (TIR-339 condition 5).
 *
 * Usage:
 *   DEPLOY_DATABASE_URL=postgresql://<deploy pg> \
 *   DATABASE_URL=postgresql://<target pg> \
 *   npx tsx src/migration/runMigrateDeployData.ts
 *
 * Guards:
 *   - Both URLs must be postgresql:// (never run against SQLite dev).
 *   - The Prisma client must be generated from the PG deploy schema.
 *   - The run is idempotent; re-running against a converged target reports
 *     the same counts and writes nothing new.
 *
 * Exit codes: 0 = migration ran (skips are reported, not fatal);
 *             1 = configuration or IO error.
 */

import { PrismaMigrationSink } from "./prismaMigrationSink";
import { PgDeploySourceReader } from "./pgDeploySource";
import { migrateDeployData } from "./migrateDeployData";

async function main(): Promise<number> {
  const deployUrl = process.env.DEPLOY_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;

  if (!deployUrl || !targetUrl) {
    console.error("DEPLOY_DATABASE_URL and DATABASE_URL are both required.");
    return 1;
  }
  for (const [name, url] of [["DEPLOY_DATABASE_URL", deployUrl], ["DATABASE_URL", targetUrl]] as const) {
    if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
      console.error(`${name} must be a postgresql:// URL (never run the migration against SQLite dev).`);
      return 1;
    }
  }

  const reader = new PgDeploySourceReader(deployUrl);
  const sink = new PrismaMigrationSink();
  try {
    console.error("[migrate-deploy-data] reading deploy database...");
    const report = await migrateDeployData(reader, sink);
    console.log(JSON.stringify(report, null, 2));
    const anySkip =
      report.airports.skipped > 0 ||
      report.checkpoints.skipped > 0 ||
      report.waitReports.skipped > 0;
    console.error(
      `[migrate-deploy-data] done: airports ${report.airports.migrated}/${report.airports.total}, ` +
        `checkpoints ${report.checkpoints.migrated}/${report.checkpoints.total}, ` +
        `waitReports ${report.waitReports.migrated}/${report.waitReports.total}` +
        (anySkip ? " (skips present - review the report above)" : ""),
    );
    return 0;
  } catch (err) {
    console.error("[migrate-deploy-data] FAILED:", err instanceof Error ? err.message : err);
    return 1;
  } finally {
    await reader.close();
    await sink.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[migrate-deploy-data] unhandled failure:", err);
    process.exit(1);
  });
