/**
 * Monorepo-Postgres sink for the data migration (TIR-339 condition 5).
 *
 * Writes through the Prisma Client generated from the PG deploy schema.
 * Every write is createMany + skipDuplicates keyed on the preserved deploy
 * ids (or natural unique keys), making repeated runs converge instead of
 * duplicating. The client must have been generated with
 * `prisma generate --schema prisma/deploy/schema.postgres.prisma` and
 * DATABASE_URL must point at the MIGRATION TARGET database.
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import type { MappedAirport, MappedCheckpointCreate, MappedReportFlag } from "./deployMapping";
import type { MigrationSink, MigratableWaitTime } from "./migrateDeployData";

/** Deterministic, non-loginable password marker for compat accounts. */
function compatPasswordHash(email: string): string {
  return createHash("sha256").update(`${email}|flyby-compat`).digest("hex");
}

export class PrismaMigrationSink implements MigrationSink {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  /**
   * createMany with skipDuplicates, the idempotency backbone of the migration.
   * skipDuplicates is a Postgres-client flag; the SQLite dev client this
   * workspace compiles against types it as `never`, so the delegate and args
   * meet through this one documented boundary. This sink is PG-only by design
   * (the CLI guards refuse non-postgres URLs) - the deployed client is
   * generated from prisma/deploy/schema.postgres.prisma where the flag is
   * first-class.
   */
  private async createManyPg<TData>(delegate: unknown, data: TData[]): Promise<void> {
    const args = { data, skipDuplicates: true };
    const createMany = (delegate as { createMany: (a: typeof args) => Promise<unknown> }).createMany;
    await createMany.call(delegate, args);
  }

  async upsertAirports(rows: MappedAirport[]): Promise<Map<string, string>> {
    if (rows.length > 0) {
      await this.createManyPg(this.prisma.airport, rows);
    }
    const codes = rows.map((r) => r.code);
    const stored = await this.prisma.airport.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    return new Map(stored.map((a) => [a.code, a.id]));
  }

  async upsertCheckpoints(rows: MappedCheckpointCreate[]): Promise<void> {
    if (rows.length === 0) return;
    await this.createManyPg(this.prisma.checkpoint, rows);
  }

  async ensureCompatUsers(emails: string[]): Promise<Map<string, string>> {
    if (emails.length > 0) {
      await this.createManyPg(
        this.prisma.user,
        emails.map((email) => ({ email, passwordHash: compatPasswordHash(email) })),
      );
    }
    const stored = await this.prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    return new Map(stored.map((u) => [u.email, u.id]));
  }

  async insertWaitTimes(rows: MigratableWaitTime[]): Promise<void> {
    if (rows.length === 0) return;
    await this.createManyPg(this.prisma.waitTime, rows);
  }

  async insertReportFlags(rows: MappedReportFlag[]): Promise<void> {
    if (rows.length === 0) return;
    await this.createManyPg(this.prisma.reportFlag, rows);
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
