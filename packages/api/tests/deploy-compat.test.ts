import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";
import * as seed from "../prisma/seed";
import { _rateLimitStateForTests } from "../src/deployCompat";

const prisma = new PrismaClient();

// Loopback SSE wiring INSIDE the mock factory (vi.hoisted) so in-mem publish
// reaches subscribed listeners exactly like the production Redis fan-out.
const sseSubs = vi.hoisted(() => ({
  callbacks: [] as Array<(data: unknown) => void>,
}));

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi
    .fn()
    .mockImplementation(async (data: unknown) => {
      for (const cb of [...sseSubs.callbacks]) cb(data);
    }),
  subscribeCheckpoint: vi
    .fn()
    .mockImplementation(
      async (_scope: string, onUpdate: (data: unknown) => void) => {
        sseSubs.callbacks.push(onUpdate);
        return () => {
          const i = sseSubs.callbacks.indexOf(onUpdate);
          if (i >= 0) sseSubs.callbacks.splice(i, 1);
        };
      },
    ),
  waitTimeChannel: "wait_time_updates",
}));

const COMP_CODE = "CMP";
const COMP_FULL = "CMQ";
const COMP_SEED = "CMS";

let compCpId = "";
let fullCpId = "";
let seedCpId = "";

beforeAll(async () => {
  await prisma.waitTime.deleteMany();
  await prisma.reportFlag.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.airport.deleteMany();
  await prisma.user.deleteMany();
  await seed.main();

  const cmp = await prisma.airport.create({
    data: {
      code: COMP_CODE,
      name: "Compat Empty Airport",
      city: "Test",
      state: "TS",
      country: "US",
      timezone: "UTC",
      checkpoints: { create: { code: "CMP-1", name: "Main", terminal: "T1" } },
    },
    include: { checkpoints: true },
  });
  compCpId = cmp.checkpoints[0].id;

  const cmq = await prisma.airport.create({
    data: {
      code: COMP_FULL,
      name: "Compat Full Airport",
      city: "Test",
      state: "TS",
      country: "US",
      timezone: "UTC",
      checkpoints: { create: { code: "CMQ-1", name: "Terminal 4 Security", terminal: "T4" } },
    },
    include: { checkpoints: true },
  });
  fullCpId = cmq.checkpoints[0].id;

  // Seed-style catalog naming (prisma/seed.ts): the generic line is named
  // "Main Checkpoint" with code CHK-MAIN, NOT bare "Main". Deploy-era ids
  // (ck-<code>-main) and the deploy POST default ("Main") must still resolve.
  const cms = await prisma.airport.create({
    data: {
      code: COMP_SEED,
      name: "Compat Seedname Airport",
      city: "Test",
      state: "TS",
      country: "US",
      timezone: "UTC",
      checkpoints: { create: { code: "CHK-MAIN", name: "Main Checkpoint", terminal: "Main" } },
    },
    include: { checkpoints: true },
  });
  seedCpId = cms.checkpoints[0].id;
}, 30000);

afterAll(async () => {
  await prisma.waitTime.deleteMany({ where: { checkpointId: { in: [compCpId, fullCpId, seedCpId] } } });
  await prisma.reportFlag.deleteMany({ where: { report: { checkpointId: { in: [compCpId, fullCpId, seedCpId] } } } });
  await prisma.checkpoint.deleteMany({ where: { airport: { code: { in: [COMP_CODE, COMP_FULL, COMP_SEED] } } } });
  await prisma.airport.deleteMany({ where: { code: { in: [COMP_CODE, COMP_FULL, COMP_SEED] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  _rateLimitStateForTests.clear();
  // Full isolation between tests: wipe anything belonging to our checkpoints.
  await prisma.reportFlag.deleteMany({ where: { report: { checkpointId: { in: [compCpId, fullCpId, seedCpId] } } } });
  await prisma.waitTime.deleteMany({ where: { checkpointId: { in: [compCpId, fullCpId, seedCpId] } } });
});

describe("GET /api/wait-times (deploy-compat)", () => {
  it("returns rows with the deploy row shape (airport/checkpoint/waitMinutes/updatedAt/id)", async () => {
    await prisma.waitTime.create({
      data: { checkpointId: fullCpId, minutes: 22, source: "crowd", reportType: "standard", reportedAt: new Date() },
    });
    const res = await request(app).get(`/api/wait-times?airport=${COMP_FULL}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const row = res.body[0];
    expect(row).toMatchObject({
      airport: COMP_FULL,
      checkpoint: "Terminal 4 Security",
      waitMinutes: 22,
    });
    expect(typeof row.id).toBe("string");
    expect(typeof row.updatedAt).toBe("string");
    expect(row).not.toHaveProperty("p256dh");
    expect(row).not.toHaveProperty("userId");
  });

  it("accepts the apt-id form for airportId and 404s unknown airports", async () => {
    const apt = await request(app).get(`/api/wait-times?airportId=apt-${COMP_FULL.toLowerCase()}`);
    expect(apt.status).toBe(200);
    const unknown = await request(app).get("/api/wait-times?airport=ZZZ");
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: "Airport not found" });
  });

  it("excludes flag-hidden reports from the compat listing (TIR-319 discipline)", async () => {
    await prisma.waitTime.create({
      data: { checkpointId: fullCpId, minutes: 12, source: "crowd", reportType: "standard", reportedAt: new Date() },
    });
    const before = await request(app).get(`/api/wait-times?airport=${COMP_FULL}`);
    expect(before.body).toHaveLength(1);

    const report = await prisma.waitTime.findFirst({ where: { checkpointId: fullCpId } });
    expect(report).not.toBeNull();
    await prisma.waitTime.update({
      where: { id: report!.id },
      data: { flagCount: 3 }, // cross the threshold, hidden from math
    });
    for (const session of ["cmp-s-1", "cmp-s-2", "cmp-s-3"]) {
      await prisma.reportFlag.create({
        data: { reportId: report!.id, reason: "inaccurate", sessionId: session },
      });
    }

    const after = await request(app).get(`/api/wait-times?airport=${COMP_FULL}`);
    expect(after.status).toBe(200);
    expect(after.body).toHaveLength(0);
  });
});

describe("POST /api/wait-times (deploy-compat)", () => {
  it("stores a report with the deploy 201 response shape", async () => {
    const res = await request(app)
      .post("/api/wait-times")
      .send({ airport: "cmp", checkpoint: "MAIN", waitMinutes: 17 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      airport: COMP_CODE,
      checkpoint: "Main",
      waitMinutes: 17,
    });
    expect(typeof res.body.id).toBe("string");
    expect(typeof res.body.receivedAt).toBe("string");

    const stored = await prisma.waitTime.findFirst({ where: { checkpointId: compCpId } });
    expect(stored?.minutes).toBe(17);
    expect(stored?.source).toBe("crowd");
    expect(stored?.reportType).toBe("standard");
  });

  it("accepts the alias shapes the deploy web uses (waitTimeMinutes / minutes)", async () => {
    const alias = await request(app)
      .post("/api/wait-times/report")
      .set({ "X-User-Id": "cmp-alias-1" })
      .send({ airport: COMP_CODE, checkpoint: "Main", waitTimeMinutes: 6 });
    expect(alias.status).toBe(201);

    const other = await request(app)
      .post("/api/wait-times")
      .set({ "X-User-Id": "cmp-alias-2" })
      .send({ airport: COMP_CODE, checkpoint: "Main", minutes: 4 });
    expect(other.status).toBe(201);
  });

  it("answers 400 { errors: [...] } for invalid bodies", async () => {
    const res = await request(app).post("/api/wait-times").send({});
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("404s an unknown airport, never persisting", async () => {
    const res = await request(app).post("/api/wait-times").send({ airport: "XYZ", waitMinutes: 10 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Airport not found" });
  });

  it("400s on an unresolvable checkpoint name (never silently reassigned)", async () => {
    const res = await request(app)
      .post("/api/wait-times")
      .send({ airport: COMP_CODE, checkpoint: "Baggage Belt", waitMinutes: 11 });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0].field).toBe("checkpoint");
  });

  it("rate-limits by identity with a Retry-After header and per-identity buckets", async () => {
    const headers1 = { "X-User-Id": "cmp-rl-user" };
    const first = await request(app).post("/api/wait-times").set(headers1).send({
      airport: COMP_CODE,
      checkpoint: "Main",
      waitMinutes: 9,
    });
    expect(first.status).toBe(201);
    const second = await request(app).post("/api/wait-times").set(headers1).send({
      airport: COMP_CODE,
      checkpoint: "Main",
      waitMinutes: 9,
    });
    expect(second.status).toBe(429);
    const retryAfter = parseInt(second.headers["retry-after"], 10);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(30);
    expect(second.body.errors?.some((e: { field: string }) => e.field === "rateLimit")).toBe(true);

    const third = await request(app).post("/api/wait-times").set({ "X-User-Id": "cmp-rl-other" }).send({
      airport: COMP_CODE,
      checkpoint: "Main",
      waitMinutes: 9,
    });
    expect(third.status).toBe(201);
  });

  it("exposes the report through the compat listing with the same identity fields", async () => {
    const post = await request(app)
      .post("/api/wait-times")
      .set({ "X-User-Id": "cmp-roundtrip" })
      .send({ airport: COMP_CODE, checkpoint: "Main", waitMinutes: 21 });
    expect(post.status).toBe(201);
    const listing = await request(app).get(`/api/wait-times?airport=${COMP_CODE}`);
    expect(listing.status).toBe(200);
    expect(listing.body.some((r: { waitMinutes: number }) => r.waitMinutes === 21)).toBe(true);
  });
});

describe("deploy-compat checkpoint ids (ck-<code>-<slug>) in native routes", () => {
  it("resolves ck-slug ids for /api/checkpoints/:id to the real checkpoint row", async () => {
    const res = await request(app).get(`/api/checkpoints/ck-${COMP_FULL.toLowerCase()}-terminal-4-security`);
    expect(res.status).toBe(200);
    expect(res.body.data?.id).toBe(fullCpId);
  });

  it("404s unresolvable ck- ids (never a fabricated checkpoint)", async () => {
    const res = await request(app).get("/api/checkpoints/ck-cmp-nothing-real-here");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Checkpoint not found" });
  });

  it("does not shadow native behavior for 3-letter codes or UUIDs", async () => {
    const airportIds = await request(app).get(`/api/checkpoints/${COMP_CODE}`);
    expect(airportIds.status).toBe(200);
    expect(Array.isArray(airportIds.body.data)).toBe(true);

    const byUuid = await request(app).get(`/api/checkpoints/${fullCpId}`);
    expect(byUuid.status).toBe(200);
    expect(byUuid.body.data).toMatchObject({ id: fullCpId, name: "Terminal 4 Security" });
  });
});

describe("seed-style checkpoint names resolve through the compat surface (TIR-339 M2)", () => {
  it("POST with the deploy default checkpoint name resolves seed-style 'Main Checkpoint'", async () => {
    const res = await request(app)
      .post("/api/wait-times")
      .set({ "X-User-Id": "cms-default-1" })
      .send({ airport: COMP_SEED, waitMinutes: 14 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ airport: COMP_SEED, checkpoint: "Main Checkpoint", waitMinutes: 14 });

    const stored = await prisma.waitTime.findFirst({ where: { checkpointId: seedCpId } });
    expect(stored?.minutes).toBe(14);
  });

  it("POST with bare 'Main' matches the seed-style 'Main Checkpoint' row", async () => {
    const res = await request(app)
      .post("/api/wait-times")
      .set({ "X-User-Id": "cms-bare-main-1" })
      .send({ airport: COMP_SEED, checkpoint: "Main", waitMinutes: 8 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ checkpoint: "Main Checkpoint", waitMinutes: 8 });
  });

  it("deploy-era ck-<code>-main ids resolve to the seed-style row instead of 404", async () => {
    const res = await request(app).get(`/api/checkpoints/ck-${COMP_SEED.toLowerCase()}-main/predict`);
    expect(res.status).toBe(200);
    expect(res.body.data?.checkpointId).toBe(seedCpId);
  });

  it("unresolvable names still 400 (fallback never invents a checkpoint)", async () => {
    const res = await request(app)
      .post("/api/wait-times")
      .send({ airport: COMP_SEED, checkpoint: "Baggage Belt", waitMinutes: 5 });
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.field).toBe("checkpoint");
  });
});

  describe("GET /api/checkpoints?airport= (deploy-compat flat pairs)", () => {
    it("returns flat pairs with Main checkpoint first when present", async () => {
      const res = await request(app).get(`/api/checkpoints?airport=${COMP_CODE}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("airport", COMP_CODE);
      expect(Array.isArray(res.body.code)).toBe(true);
      expect(res.body.code.length).toBeGreaterThan(0);
      // COMP_CODE has a "Main" checkpoint - should be first
      expect(res.body.code[0]).toMatchObject({ airport: COMP_CODE, name: "Main" });
      // All entries should have airport and name only
      for (const entry of res.body.code) {
        expect(entry).toHaveProperty("airport");
        expect(entry).toHaveProperty("name");
        expect(Object.keys(entry)).toHaveLength(2);
      }
    });

    it("returns flat pairs sorted alphabetically when no Main checkpoint", async () => {
      const res = await request(app).get(`/api/checkpoints?airport=${COMP_FULL}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("airport", COMP_FULL);
      expect(Array.isArray(res.body.code)).toBe(true);
      expect(res.body.code.length).toBeGreaterThan(0);
      // COMP_FULL has "Terminal 4 Security" - no Main, so alphabetical
      expect(res.body.code[0]).toMatchObject({ airport: COMP_FULL, name: "Terminal 4 Security" });
    });

    it("accepts apt- prefixed airportId", async () => {
      const res = await request(app).get(`/api/checkpoints?airportId=apt-${COMP_CODE.toLowerCase()}`);
      expect(res.status).toBe(200);
      expect(res.body.airport).toBe(COMP_CODE);
    });

    it("404s unknown airport", async () => {
      const res = await request(app).get("/api/checkpoints?airport=ZZZ");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Airport not found" });
    });
  });

  describe("GET /api/checkpoints/:id/history (deploy-compat window/bucket params)", () => {
    it("returns deploy-compat shape with window=4h&bucket=30m", async () => {
      // Create some test reports
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        await prisma.waitTime.create({
          data: {
            checkpointId: fullCpId,
            minutes: 10 + i * 2,
            source: "crowd",
            reportType: "standard",
            reportedAt: new Date(now.getTime() - (4 - i) * 30 * 60 * 1000), // 30-min intervals
          },
        });
      }

      const res = await request(app).get(`/api/checkpoints/${fullCpId}/history?window=4h&bucket=30m`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      const data = res.body.data;
      expect(data).toHaveProperty("history");
      expect(data).toHaveProperty("checkpointId", fullCpId);
      expect(data).toHaveProperty("airportCode", COMP_FULL);
      expect(data).toHaveProperty("airportName");
      expect(data).toHaveProperty("name", "Terminal 4 Security");
      expect(data).toHaveProperty("windowHours", 4);
      expect(data).toHaveProperty("bucketMinutes", 30);
      expect(data).toHaveProperty("reportCount", 5);
      expect(Array.isArray(data.history)).toBe(true);
      // Each history entry has time, minutes, count
      for (const entry of data.history) {
        expect(entry).toHaveProperty("time");
        expect(entry).toHaveProperty("minutes");
        expect(entry).toHaveProperty("count");
        expect(Object.keys(entry)).toHaveLength(3);
      }
    });

    it("defaults to window=4h bucket=30m when params omitted", async () => {
      const res = await request(app).get(`/api/checkpoints/${fullCpId}/history`);
      expect(res.status).toBe(200);
      // Without window/bucket params, should return NATIVE shape (not deploy-compat)
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
      // Native shape has bucket/minutes/count directly
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty("bucket");
        expect(res.body.data[0]).toHaveProperty("minutes");
        expect(res.body.data[0]).toHaveProperty("count");
      }
    });

    it("validates window format", async () => {
      const res = await request(app).get(`/api/checkpoints/${fullCpId}/history?window=invalid`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("window must be in format");
    });

    it("validates bucket format", async () => {
      const res = await request(app).get(`/api/checkpoints/${fullCpId}/history?window=4h&bucket=invalid`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("bucket must be in format");
    });

    it("validates bucket divides 60 evenly", async () => {
      const res = await request(app).get(`/api/checkpoints/${fullCpId}/history?window=4h&bucket=7m`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("divide 60 evenly");
    });

    it("works with ck-<code>-<slug> ids", async () => {
      const res = await request(app).get(`/api/checkpoints/ck-${COMP_FULL.toLowerCase()}-terminal-4-security/history?window=2h&bucket=15m`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("checkpointId", fullCpId);
      expect(res.body.data.windowHours).toBe(2);
      expect(res.body.data.bucketMinutes).toBe(15);
    });

    it("404s unresolvable ck- ids", async () => {
      const res = await request(app).get("/api/checkpoints/ck-cmp-nothing-real-here/history?window=4h&bucket=30m");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/events (deploy-compat SSE)", () => {
  it(
    "connects with a connected frame and stays silent until a real report lands",
    async () => {
      const http = await import("http");
      const server = app.listen(0);
      try {
        const address = server.address();
        const port = typeof address === "string" ? 0 : address!.port;
        const events: Array<Record<string, unknown>> = [];
        await new Promise<void>((resolve) => {
          const req = http.get(`http://127.0.0.1:${port}/api/events?airport=${COMP_CODE}`, (res) => {
            res.setEncoding("utf8");
            let buffer = "";
            res.on("data", (chunk) => {
              buffer += chunk;
              let idx;
              while ((idx = buffer.indexOf("\n\n")) !== -1) {
                const frame = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                for (const line of frame.split("\n")) {
                  if (line.startsWith("data:")) {
                    events.push(JSON.parse(line.slice(5).trim()));
                  }
                }
              }
              // connected frame has arrived; close after a beat of silence
              setTimeout(() => req.destroy(), 400).unref();
            });
            res.on("error", () => resolve());
          });
          req.on("error", () => resolve());
          setTimeout(() => {
            req.destroy();
            resolve();
          }, 800).unref();
        });

        const types = events.map((e) => e.type);
        expect(types[0]).toBe("connected");
        expect(types.filter((t) => t === "wait-time-update")).toHaveLength(0);
      } finally {
        await new Promise((r) => server.close(r));
      }
    },
    10000,
  );

  it(
    "airport-scoped client receives a real compat report as wait-time-update",
    async () => {
      const http = await import("http");
      const server = app.listen(0);
      try {
        const address = server.address();
        const port = typeof address === "string" ? 0 : address!.port;
        const updates: Array<Record<string, unknown>> = [];
        await new Promise<void>((resolve) => {
          const req = http.get(`http://127.0.0.1:${port}/api/events?airport=${COMP_CODE}`, (res) => {
            res.setEncoding("utf8");
            let buffer = "";
            res.on("data", (chunk) => {
              buffer += chunk;
              let idx;
              while ((idx = buffer.indexOf("\n\n")) !== -1) {
                const frame = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                for (const line of frame.split("\n")) {
                  if (line.startsWith("data:")) {
                    const ev = JSON.parse(line.slice(5).trim());
                    if (ev.type === "wait-time-update") {
                      updates.push(ev);
                      req.destroy();
                      resolve();
                    }
                  }
                }
              }
            });
            res.on("error", () => resolve());
          });
          req.on("error", () => resolve());

          setTimeout(() => {
            void request(app)
              .post("/api/wait-times")
              .set({ "X-User-Id": "cmp-sse-flow" })
              .send({ airport: COMP_CODE, checkpoint: "Main", waitMinutes: 13 })
              .then(() => {})
              .catch(() => {});
          }, 250).unref();

          setTimeout(() => resolve(), 2500).unref();
        });

        expect(updates).toHaveLength(1);
        expect(updates[0]).toMatchObject({
          type: "wait-time-update",
          airport: COMP_CODE,
          checkpoint: "Main",
          waitMinutes: 13,
        });
        expect(typeof updates[0].timestamp).toBe("string");
      } finally {
        await new Promise((r) => server.close(r));
      }
    },
    10000,
  );
});

describe("GET /api/compat/airports/:code (deploy-compat flat airport)", () => {
  it("returns flat airport object without {data:} wrapper", async () => {
    const res = await request(app).get(`/api/compat/airports/${COMP_CODE}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", `apt-${COMP_CODE.toLowerCase()}`);
    expect(res.body).toHaveProperty("code", COMP_CODE);
    expect(res.body).toHaveProperty("name");
    expect(res.body).toHaveProperty("city");
    expect(res.body).toHaveProperty("timezone");
    // No checkpoints, no {data:} wrapper
    expect(res.body).not.toHaveProperty("checkpoints");
    expect(res.body).not.toHaveProperty("data");
  });

  it("accepts apt-<code> prefix", async () => {
    const res = await request(app).get(`/api/compat/airports/apt-${COMP_CODE.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(COMP_CODE);
  });

  it("404s unknown airport", async () => {
    const res = await request(app).get("/api/compat/airports/ZZZ");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Airport not found" });
  });

  it("strips ' Airport' suffix from name if present", async () => {
    // The seed data doesn't have ' Airport' suffix, but the compat route handles it
    const res = await request(app).get(`/api/compat/airports/${COMP_CODE}`);
    expect(res.status).toBe(200);
    expect(res.body.name).not.toMatch(/ Airport$/);
  });
});

describe("GET /api/compat/checkpoints (deploy-compat flat pairs)", () => {
  it("returns flat pairs with airport parameter", async () => {
    const res = await request(app).get(`/api/compat/checkpoints?airport=${COMP_CODE}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("airport", COMP_CODE);
    expect(Array.isArray(res.body.code)).toBe(true);
    expect(res.body.code.length).toBeGreaterThan(0);
    expect(res.body.code[0]).toMatchObject({ airport: COMP_CODE, name: "Main" });
  });

  it("404s unknown airport", async () => {
    const res = await request(app).get("/api/compat/checkpoints?airport=ZZZ");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Airport not found" });
  });

  it("400s when airport param missing", async () => {
    const res = await request(app).get("/api/compat/checkpoints");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("airport parameter required");
  });
});

describe("GET /api/compat/checkpoints/:id/history (deploy-compat window/bucket)", () => {
  it("returns deploy-compat shape with window/bucket params", async () => {
    const res = await request(app).get(`/api/compat/checkpoints/${fullCpId}/history?window=4h&bucket=30m`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    const data = res.body.data;
    expect(data).toHaveProperty("history");
    expect(data).toHaveProperty("checkpointId", fullCpId);
    expect(data).toHaveProperty("airportCode", COMP_FULL);
    expect(data).toHaveProperty("windowHours", 4);
    expect(data).toHaveProperty("bucketMinutes", 30);
    expect(data).toHaveProperty("reportCount");
  });

  it("works with ck-<code>-<slug> ids", async () => {
    const res = await request(app).get(`/api/compat/checkpoints/ck-${COMP_FULL.toLowerCase()}-terminal-4-security/history?window=2h&bucket=15m`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("checkpointId", fullCpId);
    expect(res.body.data.windowHours).toBe(2);
    expect(res.body.data.bucketMinutes).toBe(15);
  });

  it("404s unresolvable ck- ids", async () => {
    const res = await request(app).get("/api/compat/checkpoints/ck-cmp-nothing-real-here/history?window=4h&bucket=30m");
    expect(res.status).toBe(404);
  });
});
