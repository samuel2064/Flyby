import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { catchAsyncRoutes } from "../src/middleware";
import app from "../src/app";

/**
 * Express 4 async-handler safety (TIR-339).
 *
 * The vapid-key outage class: an async route handler that throws or rejects
 * never reaches the error middleware in Express 4 - the request hangs until
 * the client gives up. catchAsyncRoutes patches the app's route methods once
 * at creation; these tests prove sync throws, rejected promises, mounted
 * routers, and the real app's normal behavior all behave.
 */

describe("catchAsyncRoutes (Express 4 async-handler safety)", () => {
  it("forwards sync throws to the error path", async () => {
    const tiny = express();
    catchAsyncRoutes(tiny);
    tiny.get("/sync-throw", () => {
      throw new Error("sync boom");
    });
    const res = await request(tiny).get("/sync-throw");
    expect(res.status).toBe(500);
  });

  it("forwards rejected promises from async handlers (previously hung the request)", async () => {
    const tiny = express();
    catchAsyncRoutes(tiny);
    tiny.get("/async-throw", async () => {
      throw new Error("async boom");
    });
    const res = await request(tiny).get("/async-throw");
    expect(res.status).toBe(500);
  });

  it("wraps handlers on Router instances patched at creation (usersRouter pattern)", async () => {
    const tiny = express();
    catchAsyncRoutes(tiny);
    const router = express.Router();
    catchAsyncRoutes(router);
    router.get("/router-throw", async () => {
      throw new Error("router boom");
    });
    tiny.use("/mounted", router);
    const res = await request(tiny).get("/mounted/router-throw");
    expect(res.status).toBe(500);
  });

  it("keeps the real app's patched Router routes functioning (usersRouter)", async () => {
    // usersRouter calls catchAsyncRoutes at creation (see src/usersRouter.ts);
    // this proves its routes still route + respond normally after the wrap.
    const res = await request(app).post("/v1/auth/login").send({ email: "nobody@flyby.test", password: "wrong" });
    expect([401, 404]).toContain(res.status);
  });

  it("passes arity-4 error handlers through unwrapped", async () => {
    const tiny = express();
    catchAsyncRoutes(tiny);
    tiny.get("/boom", async () => {
      throw new Error("handled boom");
    });
    tiny.use((err: Error, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
      res.status(500).json({ message: err.message });
    });
    const res = await request(tiny).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "handled boom" });
  });

  it("leaves successful async handlers untouched", async () => {
    const tiny = express();
    catchAsyncRoutes(tiny);
    tiny.get("/ok", async (_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(tiny).get("/ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("keeps the real app's existing error contracts working after the patch", async () => {
    // The wrap must not alter routing or error shapes on the real surface.
    const res = await request(app).get("/api/airports/QQQ");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Airport not found" });
  });
});
