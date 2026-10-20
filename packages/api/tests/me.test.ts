import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMe, patchMe } from "../src/me";

// Helper to create a fake response object
function createFakeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json } as any;
}

describe("me module", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getMe", () => {
    it("returns anonymous session with x-session-id header", () => {
      const req = {
        headers: { "x-session-id": "test-session-123" },
      };
      const res = createFakeRes();
      getMe(req as any, res);
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
      getMe(req as any, res);
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
      getMe(req as any, res1);
      getMe(req as any, res2);
      expect(res1.json.mock.calls[0][0].data.id).toBe("session-persist");
      expect(res2.json.mock.calls[0][0].data.id).toBe("session-persist");
    });

    it("tracks reports submitted per session", () => {
      const req = {
        headers: { "x-session-id": "session-reports" },
      };
      const res1 = createFakeRes();
      getMe(req as any, res1);
      expect(res1.json.mock.calls[0][0].data.reportsSubmitted).toBe(0);
    });
  });

  describe("patchMe", () => {
    it("updates session nickname", () => {
      const req = {
        headers: { "x-session-id": "session-nickname" },
        body: { nickname: "Traveler1" },
      };
      const res = createFakeRes();
      patchMe(req as any, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nickname: "Traveler1",
          }),
        })
      );
    });

    it("trims nickname to 50 characters", () => {
      const req = {
        headers: { "x-session-id": "session-long" },
        body: { nickname: "a".repeat(100) },
      };
      const res = createFakeRes();
      patchMe(req as any, res);
      const call = res.json.mock.calls[0][0];
      expect(call.data.nickname.length).toBe(50);
    });

    it("allows empty nickname", () => {
      const req = {
        headers: { "x-session-id": "session-empty" },
        body: { nickname: "" },
      };
      const res = createFakeRes();
      patchMe(req as any, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nickname: "",
          }),
        })
      );
    });

    it("preserves existing session on nickname update", () => {
      const req = {
        headers: { "x-session-id": "session-same" },
        body: { nickname: "Old" },
      };
      const res1 = createFakeRes();
      patchMe(req as any, res1);
      const id1 = res1.json.mock.calls[0][0].data.id;

      req.body.nickname = "New";
      const res2 = createFakeRes();
      patchMe(req as any, res2);
      const id2 = res2.json.mock.calls[0][0].data.id;

      expect(id1).toBe(id2);
    });

    it("allows number as nickname by converting to string", () => {
      const req = {
        headers: { "x-session-id": "session-num" },
        body: { nickname: 12345 },
      };
      const res = createFakeRes();
      patchMe(req as any, res);
      expect(res.json.mock.calls[0][0].data.nickname).toBe("12345");
    });

    it("does not update nickname when body is empty", () => {
      const req = {
        headers: { "x-session-id": "session-empty-body" },
        body: {},
      };
      const res = createFakeRes();
      patchMe(req as any, res);
      const call = res.json.mock.calls[0][0];
      expect(call.data.nickname).toBeUndefined();
    });
  });
});
