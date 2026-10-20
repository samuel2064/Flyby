/**
 * Postgres reader for the deploy database (samuel2064/Flyby schema).
 *
 * Column/table names follow the deploy schema's Prisma defaults (PascalCase
 * models -> quoted table names, camelCase columns) as recorded in the
 * deployMapping.ts header. Any drift between that record and the live prod
 * database fails loudly here (SQL errors), which is the intended behavior:
 * the schema dump from TIR-336 must be reconciled BEFORE a migration run.
 */

import { Pool, type PoolClient } from "pg";
import type {
  DeployAirportRow,
  DeployReportFlagRow,
  DeployWaitReportRow,
} from "./deployMapping";
import type { DeployCheckpointRow, DeploySourceReader } from "./migrateDeployData";

export class PgDeploySourceReader implements DeploySourceReader {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 2 });
  }

  async readAirports(): Promise<DeployAirportRow[]> {
    const { rows } = await this.pool.query<{
      id: string;
      iataCode: string;
      name: string;
      city: string;
      country: string | null;
      latitude: number | null;
      longitude: number | null;
      timezone: string | null;
      createdAt: Date;
    }>(
      `SELECT id, "iataCode", name, city, country, latitude, longitude, timezone, "createdAt"
       FROM "Airport" ORDER BY id`,
    );
    return rows;
  }

  async readCheckpoints(): Promise<DeployCheckpointRow[]> {
    const { rows } = await this.pool.query<DeployCheckpointRow>(
      `SELECT id, "airportId", terminal, name, latitude, longitude, active, "createdAt"
       FROM "Checkpoint" ORDER BY id`,
    );
    return rows;
  }

  async readWaitReports(afterId: string | null, limit: number): Promise<DeployWaitReportRow[]> {
    const { rows } = afterId === null
      ? await this.pool.query<DeployWaitReportRow>(
          `SELECT id, "checkpointId", minutes, source, "reportType", "sessionId", "reportedAt", "createdAt"
           FROM "WaitReport" ORDER BY id LIMIT $1`,
          [limit],
        )
      : await this.pool.query<DeployWaitReportRow>(
          `SELECT id, "checkpointId", minutes, source, "reportType", "sessionId", "reportedAt", "createdAt"
           FROM "WaitReport" WHERE id > $1 ORDER BY id LIMIT $2`,
          [afterId, limit],
        );
    return rows;
  }

  async readReportFlags(): Promise<DeployReportFlagRow[]> {
    const { rows } = await this.pool.query<DeployReportFlagRow>(
      `SELECT id, "reportId", reason, note, "sessionId", "createdAt"
       FROM "ReportFlag" ORDER BY id`,
    );
    return rows;
  }

  /** Acquire a client for one-off probes (e.g. pre-flight table existence). */
  async withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
