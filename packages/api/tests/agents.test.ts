import { describe, it, expect, vi } from "vitest";
import { getAgentsMe, getInboxLite, getSessionId, getOrCreateSession } from "../src/agents";

// Helper to create a fake response object
function createFakeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json } as any;
}

describe("agents module", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAgentsMe", () => {
    it("returns anonymous session with x-session-id header", () => {
      const req = {
        headers: { "x-session-id": "test-session-123" },
      };
      const res = createFakeRes();
      getAgentsMe(req as any, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: "test-session-123",
            reportsSubmitted: 0,
            createdAt: expect.any(String),
          }),
        })
      );
    });

    it("generates random id when header is missing", () => {
      const req = { headers: {} };
      const res = createFakeRes();
      getAgentsMe(req as any, res);
      const call = res.json.mock.calls[0][0];
      expect(call.data.id).toMatch(/^anon-/);
      expect(call.data.id.length).toBeGreaterThan(10);
    });

    it("returns same session id on repeated calls with same header", () => {
      const req = {
        headers: { "x-session-id": "session-persist" },
      };
      const res1 = createFakeRes();
      const res2 = createFakeRes();
      getAgentsMe(req as any, res1);
      getAgentsMe(req as any, res2);
      expect(res1.json.mock.calls[0][0].data.id).toBe("session-persist");
      expect(res2.json.mock.calls[0][0].data.id).toBe("session-persist");
    });

    it("tracks reports submitted per session", () => {
      const req = {
        headers: { "x-session-id": "session-reports" },
      };
      const res1 = createFakeRes();
      getAgentsMe(req as any, res1);
      expect(res1.json.mock.calls[0][0].data.reportsSubmitted).toBe(0);
    });
  });

  describe("getInboxLite", () => {
    it("returns inbox with session info", () => {
      const req = {
        headers: { "x-session-id": "test-session-456" },
      };
      const res = createFakeRes();
      getInboxLite(req as any, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: expect.any(String),
            reportsSubmitted: 0,
            agent: "flyby-agent",
          }),
        })
      );
    });

    it("generates random session id when header is missing", () => {
      const req = { headers: {} };
      const res = createFakeRes();
      getInboxLite(req as any, res);
      const call = res.json.mock.calls[0][0];
      expect(call.data.sessionId).toMatch(/^anon-/);
    });

    it("returns same session on repeated calls", () => {
      const req = {
        headers: { "x-session-id": "session-persist-inbox" },
      };
      const res1 = createFakeRes();
      const res2 = createFakeRes();
      getInboxLite(req as any, res1);
      getInboxLite(req as any, res2);
      expect(res1.json.mock.calls[0][0].data.sessionId).toBe(
        res2.json.mock.calls[0][0].data.sessionId
      );
    });
  });

  describe("getSessionId", () => {
    it("returns provided header value", () => {
      const id = getSessionId({ headers: { "x-session-id": "my-header" } } as any);
      expect(id).toBe("my-header");
    });

    it("generates anon id when header missing", () => {
      const id = getSessionId({ headers: {} } as any);
      expect(id).toMatch(/^anon-/);
      expect(id.length).toBeGreaterThan(10);
    });
  });

  describe("getOrCreateSession", () => {
    it("creates new session when id not exists", () => {
      const session = getOrCreateSession({ headers: {} } as any);
      expect(session.id).toMatch(/^anon-/);
      expect(session.reportsSubmitted).toBe(0);
    });

    it("returns existing session when id already present", () => {
      const session1 = getOrCreateSession({
        headers: { "x-session-id": "persist-test" },
      } as any);
      const session2 = getOrCreateSession({
        headers: { "x-session-id": "persist-test" },
      } as any);
      expect(session1.id).toBe(session2.id);
    });
  });
});
describe("agents module - error arms (direct invocation)", () => {
  it("getAgentsMe returns 500 when the request object is unusable", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = createFakeRes();
    const poisonedReq = {
      get headers() {
        throw new Error("request destroyed");
      },
    } as unknown as Parameters<typeof getAgentsMe>[0];

    getAgentsMe(poisonedReq, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status().json).toHaveBeenCalledWith({ error: "Internal server error" });
    consoleSpy.mockRestore();
  });

  it("getInboxLite returns 500 when the request object is unusable", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = createFakeRes();
    const poisonedReq = {
      get headers() {
        throw new Error("request destroyed");
      },
    } as unknown as Parameters<typeof getInboxLite>[0];

    getInboxLite(poisonedReq, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status().json).toHaveBeenCalledWith({ error: "Internal server error" });
    consoleSpy.mockRestore();
  });
});
