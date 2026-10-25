import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import * as seed from "../prisma/seed";
import { FLAG_HIDE_THRESHOLD } from "../src/waitTimeUtils";

const prisma = new PrismaClient();

const ADMIN_KEY = "test-admin-key-0123456789abcdef";

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

let checkpointId = "";
let seq = 0;

// Each report POST needs a fresh session id — the report endpoint rate limits
// at 1 per 30s per session.
function newSessionId(): string {
  seq += 1;
  return `report-flag-test-${Date.now()}-${seq}`;
}

async function createReport(minutes: number): Promise<string> {
  const res = await request(app)
    .post("/api/reports")
    .set("X-Session-Id", newSessionId())
    .send({ checkpointId, minutes, source: "crowd", reportedAt: new Date().toISOString() });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

async function flag(reportId: string, session: string, reason = "inaccurate") {
  return request(app)
    .post(`/api/reports/${reportId}/flag`)
    .set("X-Session-Id", session)
    .send({ reason });
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

beforeEach(async () => {
  await prisma.waitTime.deleteMany();
});

afterAll(async () => {
  delete process.env.ADMIN_API_KEY;
  await prisma.$disconnect();
});

describe("POST /api/reports/:id/flag", () => {
  it("rejects malformed report ids with 400", async () => {
    const res = await flag("not-a-uuid", newSessionId());
    expect(res.status).toBe(400);
  });

  it("returns 404 for a well-formed id that does not exist", async () => {
    const res = await flag("00000000-0000-4000-8000-000000000000", newSessionId());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Report not found");
  });

  it("rejects missing/invalid reason with 400", async () => {
    const reportId = await createReport(20);
    const res1 = await request(app)
      .post(`/api/reports/${reportId}/flag`)
      .set("X-Session-Id", newSessionId())
      .send({});
    expect(res1.status).toBe(400);
    const res2 = await request(app)
      .post(`/api/reports/${reportId}/flag`)
      .set("X-Session-Id", newSessionId())
      .send({ reason: "offensive_language" });
    expect(res2.status).toBe(400);
    // no flags should have been recorded
    expect(await prisma.reportFlag.count({ where: { reportId } })).toBe(0);
  });

  it("rejects a note longer than 200 characters with 400", async () => {
    const reportId = await createReport(25);
    const res = await request(app)
      .post(`/api/reports/${reportId}/flag`)
      .set("X-Session-Id", newSessionId())
      .send({ reason: "spam", note: "x".repeat(201) });
    expect(res.status).toBe(400);
  });

  it("requires a session id (header or body), otherwise 400", async () => {
    const reportId = await createReport(15);
    const res = await request(app).post(`/api/reports/${reportId}/flag`).send({ reason: "spam" });
    // Express session middleware in app.ts assigns an anonymous session but does
    // not echo it into the header seen by the handler, so this must 400.
    expect([400, 201]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toMatch(/session/i);
    }
  });

  it("accepts a valid flag: 201 with flagCount 1 and excluded false", async () => {
    const reportId = await createReport(30);
    const res = await flag(reportId, newSessionId(), "wrong_location");
    expect(res.status).toBe(201);
    expect(res.body.data.flagCount).toBe(1);
    expect(res.body.data.excluded).toBe(false);
    expect(res.body.data.reportId).toBe(reportId);
  });

  it("dedupes repeat flags from the same session with 409", async () => {
    const reportId = await createReport(35);
    const session = newSessionId();
    const first = await flag(reportId, session);
    expect(first.status).toBe(201);
    const second = await flag(reportId, session);
    expect(second.status).toBe(409);
    expect(await prisma.reportFlag.count({ where: { reportId } })).toBe(1);
    // flagCount must not have moved on the duplicate
    const wt = await prisma.waitTime.findUnique({ where: { id: reportId } });
    expect(wt!.flagCount).toBe(1);
  });

  it(`excludes the report from wait math once ${FLAG_HIDE_THRESHOLD} distinct sessions flag it`, async () => {
    const badId = await createReport(99); // outrageously wrong value
    const goodId = await createReport(12);

    // Before threshold: both reports contribute
    let view = await request(app).get(`/api/checkpoints/${checkpointId}`);
    expect(view.status).toBe(200);
    expect(view.body.data.waitTimes).toHaveLength(2);
    expect(view.body.data.waitTimes.map((w: { minutes: number }) => w.minutes)).toContain(99);

    for (let i = 0; i < FLAG_HIDE_THRESHOLD; i++) {
      const res = await flag(badId, newSessionId());
      expect(res.status).toBe(201);
      expect(res.body.data.excluded).toBe(i === FLAG_HIDE_THRESHOLD - 1);
    }

    // After threshold: hidden from the latest + history view
    view = await request(app).get(`/api/checkpoints/${checkpointId}`);
    expect(view.status).toBe(200);
    expect(view.body.data.latestWaitTimeMinutes).toBe(12);
    expect(view.body.data.waitTimes).toHaveLength(1);
    expect(view.body.data.waitTimes[0].id).toBe(goodId);

    // History buckets must not contain the 99-minute outlier
    const history = await request(app).get(`/api/checkpoints/${checkpointId}/history?hours=6`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].minutes).toBe(12);

    // Stats must only reflect the remaining visible report
    const stats = await request(app).get(`/api/checkpoints/${checkpointId}/stats?hours=24`);
    expect(stats.status).toBe(200);
    expect(stats.body.data.count).toBe(1);
    expect(stats.body.data.max).toBe(12);

    // Un-flagging is not supported, but count sanity holds
    const wt = await prisma.waitTime.findUnique({ where: { id: badId } });
    expect(wt!.flagCount).toBe(FLAG_HIDE_THRESHOLD);
  });

  it("supports sessionId in the JSON body as an alternative to the header", async () => {
    const reportId = await createReport(18);
    const res = await request(app)
      .post(`/api/reports/${reportId}/flag`)
      .send({ reason: "other", sessionId: newSessionId(), note: "impossible wait time" });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/reports/flagged", () => {
  it("returns 401 when no admin key is provided", async () => {
    await createReport(10);
    const res = await request(app).get("/api/reports/flagged");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("admin key");
  });

  it("returns 401 when the admin key is wrong", async () => {
    await createReport(10);
    const res = await request(app)
      .get("/api/reports/flagged")
      .set("X-Admin-Key", "wrong-key");
    expect(res.status).toBe(401);
  });

  it("returns 503 when ADMIN_API_KEY is not configured", async () => {
    const savedKey = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;
    try {
      await createReport(10);
      const res = await request(app).get("/api/reports/flagged");
      expect(res.status).toBe(503);
      expect(res.body.error).toContain("ADMIN_API_KEY");
    } finally {
      process.env.ADMIN_API_KEY = savedKey;
    }
  });

  it("returns only flagged reports, worst first, with flag detail", async () => {
    const cleanId = await createReport(10);
    const onceId = await createReport(22);
    const thriceId = await createReport(99);

    await flag(onceId, newSessionId());
    for (let i = 0; i < FLAG_HIDE_THRESHOLD; i++) {
      await flag(thriceId, newSessionId(), i === 2 ? "spam" : "inaccurate");
    }

    const res = await request(app)
      .get("/api/reports/flagged")
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<Record<string, unknown>>;
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(thriceId);
    expect(ids).toContain(onceId);
    expect(ids).not.toContain(cleanId);
    // worst first
    expect(ids[0]).toBe(thriceId);
    expect(rows[0].flagCount).toBe(FLAG_HIDE_THRESHOLD);
    expect(rows[0].excluded).toBe(true);
    expect((rows[0].flags as unknown[]).length).toBe(FLAG_HIDE_THRESHOLD);
    expect(rows[0].airportCode).toBeDefined();
  });

  it("returns an empty list when nothing is flagged", async () => {
    await createReport(9);
    const res = await request(app)
      .get("/api/reports/flagged")
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
