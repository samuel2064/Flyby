import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import * as seed from "../prisma/seed";

const prisma = new PrismaClient();

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

const ADMIN_KEY = "test-admin-key-0123456789abcdef";

let checkpointId = "";
let seq = 0;

// Each report POST needs a fresh session id — the report endpoint rate limits
// at 1 per 30s per session.
function newSessionId(): string {
  seq += 1;
  return `report-delete-test-${Date.now()}-${seq}`;
}

async function createReport(minutes: number): Promise<string> {
  const res = await request(app)
    .post("/api/reports")
    .set("X-Session-Id", newSessionId())
    .send({ checkpointId: checkpointId, minutes, source: "crowd", reportedAt: new Date().toISOString() });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

beforeAll(async () => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;

  await prisma.waitTime.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  const cp = await prisma.checkpoint.findFirst();
  expect(cp).not.toBeNull();
  checkpointId = cp!.id;
});

afterAll(async () => {
  delete process.env.ADMIN_API_KEY;
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.waitTime.deleteMany();
});

describe("DELETE /api/reports/:id — authentication", () => {
  it("returns 401 when no admin key is provided", async () => {
    const id = await createReport(15);
    const res = await request(app).delete(`/api/reports/${id}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("admin key");
  });

  it("returns 401 when the admin key is wrong", async () => {
    const id = await createReport(15);
    const res = await request(app)
      .delete(`/api/reports/${id}`)
      .set("X-Admin-Key", "wrong-key");
    expect(res.status).toBe(401);
  });

  it("returns 401 when a valid user JWT is used instead of the admin key", async () => {
    // A regular user token must NOT authorize a destructive delete
    const id = await createReport(15);
    const res = await request(app)
      .delete(`/api/reports/${id}`)
      .set("Authorization", "Bearer some-user-jwt");
    expect(res.status).toBe(401);
  });

  it("returns 401 for an empty X-Admin-Key header", async () => {
    const id = await createReport(15);
    const res = await request(app)
      .delete(`/api/reports/${id}`)
      .set("X-Admin-Key", "");
    expect(res.status).toBe(401);
  });

  it("returns 503 (fail closed) when ADMIN_API_KEY is not configured", async () => {
    const id = await createReport(15);
    const savedKey = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;
    try {
      const res = await request(app)
        .delete(`/api/reports/${id}`)
        .set("X-Admin-Key", ADMIN_KEY);
      expect(res.status).toBe(503);
      expect(res.body.error).toContain("ADMIN_API_KEY");

      // Even without any credentials the endpoint must not delete
      const stillThere = await prisma.waitTime.findUnique({ where: { id } });
      expect(stillThere).not.toBeNull();
    } finally {
      process.env.ADMIN_API_KEY = savedKey;
    }
  });

  it("authenticates via Authorization: Bearer <admin key> as well as X-Admin-Key", async () => {
    const id = await createReport(15);
    const res = await request(app)
      .delete(`/api/reports/${id}`)
      .set("Authorization", `Bearer ${ADMIN_KEY}`);
    expect(res.status).toBe(204);
  });
});

describe("DELETE /api/reports/:id — validation and lookup", () => {
  it("returns 400 for an invalid id format (with valid admin key)", async () => {
    const res = await request(app)
      .delete("/api/reports/not-a-valid-id")
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid ID format");
  });

  it("returns 404 for a well-formed id that does not exist", async () => {
    const res = await request(app)
      .delete("/api/reports/00000000-0000-0000-0000-000000000000")
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Report not found");
  });

  it("returns 404 when deleting an already-deleted report (idempotent, no 500)", async () => {
    const id = await createReport(15);
    const first = await request(app)
      .delete(`/api/reports/${id}`)
      .set("X-Admin-Key", ADMIN_KEY);
    expect(first.status).toBe(204);

    const second = await request(app)
      .delete(`/api/reports/${id}`)
      .set("X-Admin-Key", ADMIN_KEY);
    expect(second.status).toBe(404);
  });
});

describe("DELETE /api/reports/:id — deletion effects", () => {
  it("deletes the report from the database and returns 204", async () => {
    const id = await createReport(42);
    const res = await request(app)
      .delete(`/api/reports/${id}`)
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const dbReport = await prisma.waitTime.findUnique({ where: { id } });
    expect(dbReport).toBeNull();
  });

  it("removes the record from the checkpoint view (GET /api/checkpoints/:id)", async () => {
    const cpId = checkpointId;
    await prisma.waitTime.deleteMany({ where: { checkpointId: cpId } });

    const keptId = await createReport(10);
    const deletedId = await createReport(99);

    const before = await request(app).get(`/api/checkpoints/${cpId}`);
    expect(before.status).toBe(200);
    expect(before.body.data.waitTimes.map((wt: { id: string }) => wt.id)).toContain(deletedId);
    expect(before.body.data.latestWaitTimeMinutes).toBe(99);

    const res = await request(app)
      .delete(`/api/reports/${deletedId}`)
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(204);

    const after = await request(app).get(`/api/checkpoints/${cpId}`);
    expect(after.status).toBe(200);
    const ids = after.body.data.waitTimes.map((wt: { id: string }) => wt.id);
    expect(ids).not.toContain(deletedId);
    expect(ids).toContain(keptId);
    // Latest falls back to the remaining report
    expect(after.body.data.latestWaitTimeMinutes).toBe(10);
  });

  it("removes the record from the airport checkpoint list view", async () => {
    const cp = await prisma.checkpoint.findFirst({
      include: { airport: { select: { code: true } } },
    });
    await prisma.waitTime.deleteMany({ where: { checkpointId: cp!.id } });

    const deletedId = await createReport(25);
    const before = await request(app).get(`/api/checkpoints/airport/${cp!.airport.code}`);
    const beforeIds: string[] = before.body.data
      .flatMap((c: { waitTimes: { id: string }[] }) => c.waitTimes.map((wt) => wt.id));
    expect(beforeIds).toContain(deletedId);

    const res = await request(app)
      .delete(`/api/reports/${deletedId}`)
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(204);

    const after = await request(app).get(`/api/checkpoints/airport/${cp!.airport.code}`);
    const afterIds: string[] = after.body.data
      .flatMap((c: { waitTimes: { id: string }[] }) => c.waitTimes.map((wt) => wt.id));
    expect(afterIds).not.toContain(deletedId);
  });

  it("deleting the latest report updates the consensus estimate", async () => {
    const cpId = checkpointId;
    await prisma.waitTime.deleteMany({ where: { checkpointId: cpId } });

    const lowId = await createReport(5);
    await createReport(60);

    const before = await request(app).get(`/api/checkpoints/${cpId}`);
    expect(before.body.data.latestWaitTimeMinutes).toBe(60);

    const res = await request(app)
      .delete(`/api/reports/${lowId}`)
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(204);

    const after = await request(app).get(`/api/checkpoints/${cpId}`);
    const ids = after.body.data.waitTimes.map((wt: { id: string }) => wt.id);
    expect(ids).not.toContain(lowId);
    expect(after.body.data.latestWaitTimeMinutes).toBe(60);
  });

  it("does not delete other reports at the same checkpoint", async () => {
    const cpId = checkpointId;
    await prisma.waitTime.deleteMany({ where: { checkpointId: cpId } });

    const idA = await createReport(10);
    const idB = await createReport(20);

    const res = await request(app)
      .delete(`/api/reports/${idA}`)
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(204);

    const survivor = await prisma.waitTime.findUnique({ where: { id: idB } });
    expect(survivor).not.toBeNull();
    expect(survivor!.minutes).toBe(20);
  });
});

describe("DELETE /api/reports/:id — audit logging", () => {
  it("emits a structured report_deleted audit line on success", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const id = await createReport(31);
      const res = await request(app)
        .delete(`/api/reports/${id}`)
        .set("X-Admin-Key", ADMIN_KEY);
      expect(res.status).toBe(204);

      expect(infoSpy).toHaveBeenCalled();
      const calls = infoSpy.mock.calls.map((args) => args.join(" "));
      const auditCall = calls.find((c) => c.includes('"event":"report_deleted"'));
      expect(auditCall).toBeDefined();

      const entry = JSON.parse(
        calls.find((c) => c.startsWith('{"event":"report_deleted"'))!
      );
      expect(entry.reportId).toBe(id);
      expect(entry.checkpointId).toBe(checkpointId);
      expect(entry.minutes).toBe(31);
      expect(entry.source).toBe("crowd");
      expect(entry.timestamp).toBeDefined();
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("does not emit an audit line when auth fails", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const id = await createReport(15);
      const res = await request(app).delete(`/api/reports/${id}`);
      expect(res.status).toBe(401);

      const calls = infoSpy.mock.calls.map((args) => args.join(" "));
      expect(calls.some((c) => c.includes("report_deleted"))).toBe(false);
    } finally {
      infoSpy.mockRestore();
    }
  });
});
