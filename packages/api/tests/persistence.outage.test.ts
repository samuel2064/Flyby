import request from "supertest";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import * as seed from "../prisma/seed";
import { publishWaitTime } from "../src/redis";

vi.mock("../src/redis", () => ({
  redisClient: { on: vi.fn(), ping: vi.fn().mockResolvedValue("PONG") },
  redisPub: { publish: vi.fn().mockResolvedValue(undefined) },
  redisSub: { on: vi.fn(), subscribe: vi.fn() },
  publishWaitTime: vi.fn().mockResolvedValue(undefined),
  subscribeCheckpoint: vi.fn().mockResolvedValue(() => {}),
  waitTimeChannel: "wait_time_updates",
}));

// TIR-378 acceptance: "Add database outage + recovery tests" for both report
// write paths (native reportWaitTime + deploy-compat postWaitTimeCompat).
// Guarantees under test:
//   - a failed insert never returns 201 (fails closed as 500 "Database unavailable")
//   - a failed insert is never broadcast to SSE subscribers
//   - after the outage ends, the same paths persist and broadcast again
//
// Outage simulation follows the established prisma-swap pattern
// (airports.errors.test.ts): replace the model delegate with a rejecting
// vi.fn. Because both handlers insert through prisma.$transaction(async (tx)
// => tx.waitTime.create(...)), the shim forwards the interactive callback to
// the main client so the rejecting delegate sits inside the transaction.

let checkpointId = "";
let compatAirportCode = "";
let compatCheckpointName = "";
let compatCheckpointId = "";

beforeAll(async () => {
  await seed.main();

  const cp = await prisma.checkpoint.findFirst({ select: { id: true } });
  expect(cp).not.toBeNull();
  checkpointId = cp!.id;

  const apt = await prisma.airport.findFirst({
    include: { checkpoints: { select: { id: true, name: true } } },
  });
  expect(apt).not.toBeNull();
  compatAirportCode = apt!.code;
  compatCheckpointName = apt!.checkpoints[0].name;
  compatCheckpointId = apt!.checkpoints[0].id;
}, 60000);

const originalCreate = prisma.waitTime.create;
const originalTransaction = prisma.$transaction.bind(prisma);

// Route the interactive-transaction callback through the main client so the
// swapped waitTime.create delegate is the one invoked inside the transaction.
const transactionToMainClient = async (arg: unknown) =>
  typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : originalTransaction(arg);

afterEach(() => {
  prisma.waitTime.create = originalCreate;
  prisma.$transaction = originalTransaction as typeof prisma.$transaction;
});

describe("TIR-378: native report write path (POST /api/checkpoints/:id/wait-times)", () => {
  it("fails closed on DB outage: 500, never 201, no SSE broadcast", async () => {
    prisma.$transaction = transactionToMainClient as unknown as typeof prisma.$transaction;
    prisma.waitTime.create = vi.fn().mockRejectedValue(new Error("DB connection lost"));
    vi.mocked(publishWaitTime).mockClear();

    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "tir378-native-outage")
      .send({ minutes: 25, reportedAt: new Date().toISOString() });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Database unavailable");
    expect(publishWaitTime).not.toHaveBeenCalled();
  });

  it("recovers after the outage: 201, real transaction commits, SSE broadcast fires", async () => {
    vi.mocked(publishWaitTime).mockClear();

    const res = await request(app)
      .post(`/api/checkpoints/${checkpointId}/wait-times`)
      .set("X-Session-Id", "tir378-native-recover")
      .send({ minutes: 30, reportedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeTruthy();
    expect(res.body.data.minutes).toBe(30);
    expect(publishWaitTime).toHaveBeenCalledTimes(1);

    const persisted = await prisma.waitTime.findUnique({ where: { id: res.body.data.id } });
    expect(persisted).not.toBeNull();
    expect(persisted!.minutes).toBe(30);
  });
});

describe("TIR-378: deploy-compat report write path (POST /api/wait-times)", () => {
  it("fails closed on DB outage: 500, never 201, no SSE broadcast", async () => {
    prisma.$transaction = transactionToMainClient as unknown as typeof prisma.$transaction;
    prisma.waitTime.create = vi.fn().mockRejectedValue(new Error("DB connection lost"));
    vi.mocked(publishWaitTime).mockClear();

    const res = await request(app)
      .post("/api/wait-times")
      .set("X-User-Id", "tir378-compat-outage")
      .send({ airport: compatAirportCode, checkpoint: compatCheckpointName, waitMinutes: 20 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Database unavailable");
    expect(publishWaitTime).not.toHaveBeenCalled();
  });

  it("recovers after the outage: 201, real transaction commits, SSE broadcast fires", async () => {
    vi.mocked(publishWaitTime).mockClear();

    const res = await request(app)
      .post("/api/wait-times")
      .set("X-User-Id", "tir378-compat-recover")
      .send({ airport: compatAirportCode, checkpoint: compatCheckpointName, waitMinutes: 20 });

    expect(res.status).toBe(201);
    expect(res.body.waitMinutes).toBe(20);
    expect(publishWaitTime).toHaveBeenCalledTimes(1);

    const persisted = await prisma.waitTime.findUnique({ where: { id: res.body.id } });
    expect(persisted).not.toBeNull();
    expect(persisted!.checkpointId).toBe(compatCheckpointId);
  });
});
