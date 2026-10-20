import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

// Hoisted mocks - must not reference top-level variables
const mockQueryRaw = vi.fn();
const mockPing = vi.fn();

vi.mock("@prisma/client", () => {
  class MockPrismaClient {
    $queryRaw = () => mockQueryRaw();
    $connect = vi.fn();
    $disconnect = vi.fn();
  }
  return {
    PrismaClient: MockPrismaClient,
  };
});

vi.mock("../src/redis", () => ({
  redisClient: {
    on: vi.fn(),
    ping: () => mockPing(),
  },
}));

// Import after mocks are set up
import { requestLogger, healthHandler, errorHandler, notFoundHandler, securityHeaders, requestTimeout, cacheHeaders, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from "../src/middleware";
import { metricsMiddleware } from "../src/metrics";

describe("requestLogger", () => {
  let req: Partial<Request>;
  let res: any;
  let next: any;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.restoreAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    next = vi.fn();

    req = {
      method: "GET",
      path: "/api/airports",
      ip: "127.0.0.1",
      headers: {
        "user-agent": "test-agent",
        authorization: "Bearer secret",
        cookie: "session=abc",
      },
    };

    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    res = {
      statusCode: 200,
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(cb);
        return res;
      }),
      removeListener: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        const arr = listeners.get(event);
        if (arr) {
          const idx = arr.indexOf(cb);
          if (idx !== -1) arr.splice(idx, 1);
        }
      }),
      emit: (event: string) => {
        (listeners.get(event) || []).forEach((cb) => cb());
      },
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("logs requests as JSON with correct fields when not in test env", () => {
    process.env.NODE_ENV = "development";
    requestLogger(req as Request, res as Response, next);
    res.emit("finish");

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logEntry = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logEntry).toMatchObject({
      method: "GET",
      path: "/api/airports",
      status: 200,
      ip: "127.0.0.1",
      user_agent: "test-agent",
    });
    expect(logEntry).toHaveProperty("timestamp");
    expect(logEntry).toHaveProperty("duration_ms");
    expect(typeof logEntry.duration_ms).toBe("number");
  });

  it("redacts sensitive headers", () => {
    process.env.NODE_ENV = "development";
    // Add x-session-id to test session_id redaction
    req.headers!["x-session-id"] = "test-session-123";
    requestLogger(req as Request, res as Response, next);
    res.emit("finish");

    const logEntry = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logEntry.headers.authorization).toBe("[REDACTED]");
    expect(logEntry.headers.cookie).toBe("[REDACTED]");
    expect(logEntry.session_id).toBe("[REDACTED]");
  });

  it("skips /health requests", () => {
    req.path = "/health";
    requestLogger(req as Request, res as Response, next);
    res.emit("finish");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("skips favicon requests", () => {
    req.path = "/favicon.ico";
    requestLogger(req as Request, res as Response, next);
    res.emit("finish");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("logs response finish events and removes listeners", () => {
    process.env.NODE_ENV = "development";
    requestLogger(req as Request, res as Response, next);
    res.emit("finish");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(res.removeListener).toHaveBeenCalledWith("finish", expect.any(Function));
    expect(res.removeListener).toHaveBeenCalledWith("close", expect.any(Function));
  });
});

describe("healthHandler", () => {
  let req: Partial<Request>;
  let res: any;

  beforeEach(() => {
    mockQueryRaw.mockClear().mockResolvedValue(1);
    mockPing.mockClear().mockResolvedValue("PONG");

    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it("returns healthy when all services are up", async () => {
    await healthHandler(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe("ok");
    expect(body.services.database).toBe("ok");
    expect(body.services.redis).toBe("ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("uptime_seconds");
    expect(body).toHaveProperty("environment");
    expect(body).toHaveProperty("version");
  });

  it("returns degraded when Redis is down", async () => {
    mockPing.mockRejectedValueOnce(new Error("Redis connection refused"));

    await healthHandler(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("ok");
    expect(body.services.redis).toBe("error");
  });

  it("returns unhealthy when both services are down", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("DB connection refused"));
    mockPing.mockRejectedValueOnce(new Error("Redis connection refused"));

    await healthHandler(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(503);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe("unhealthy");
    expect(body.services.database).toBe("error");
    expect(body.services.redis).toBe("error");
  });
});

describe("errorHandler", () => {
  let req: Partial<Request>;
  let res: any;
  let next: any;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.restoreAllMocks();
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    next = vi.fn();

    req = {
      method: "GET",
      path: "/api/test",
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("returns 500 for generic errors", () => {
    const err = new Error("Something went wrong");
    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Internal server error");
    expect(body.error.path).toBe("/api/test");
    expect(body.error).toHaveProperty("timestamp");
  });

  it("returns 400 for ValidationError", () => {
    const err = new Error("Invalid email format");
    err.name = "ValidationError";
    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Invalid email format");
  });

  it("returns 401 for UnauthorizedError", () => {
    const err = new Error("Unauthorized");
    err.name = "UnauthorizedError";
    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Unauthorized");
  });

  it("returns 403 for ForbiddenError", () => {
    const err = new Error("Access denied");
    err.name = "ForbiddenError";
    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Forbidden");
  });

  it("returns 404 for NotFoundError", () => {
    const err = new Error("Resource not found");
    err.name = "NotFoundError";
    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Resource not found");
  });

  it("returns 400 for Prisma errors", () => {
    const err = new Error("Prisma constraint violation");
    err.name = "PrismaClientKnownRequestError";
    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe("DATABASE_ERROR");
    expect(body.error.message).toBe("Database error");
  });

  it("logs error details in development environment", () => {
    process.env.NODE_ENV = "development";
    const err = new Error("Test error");
    errorHandler(err, req as Request, res as Response, next);

    expect(consoleSpy).toHaveBeenCalledWith("Unhandled error:", err);
  });

  it("does not log error details in production environment", () => {
    process.env.NODE_ENV = "production";
    const err = new Error("Test error");
    errorHandler(err, req as Request, res as Response, next);

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

describe("notFoundHandler", () => {
  let req: Partial<Request>;
  let res: any;

  beforeEach(() => {
    req = {
      method: "GET",
      path: "/api/nonexistent",
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it("returns 404 for unmatched routes", () => {
    notFoundHandler(req as Request, res as Response, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(body.error.message).toBe("Cannot GET /api/nonexistent");
    expect(body.error.path).toBe("/api/nonexistent");
    expect(body.error).toHaveProperty("timestamp");
  });

  it("handles different HTTP methods", () => {
    req.method = "POST";
    notFoundHandler(req as Request, res as Response, vi.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.error.message).toBe("Cannot POST /api/nonexistent");
  });
});

describe("securityHeaders", () => {
  let req: Partial<Request>;
  let res: any;
  let next: any;

  beforeEach(() => {
    next = vi.fn();
    req = { path: "/api/test", method: "GET" };
    res = {
      setHeader: vi.fn(),
    };
  });

  it("adds security headers to response", () => {
    securityHeaders(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    expect(res.setHeader).toHaveBeenCalledWith("X-XSS-Protection", "1; mode=block");
    expect(res.setHeader).toHaveBeenCalledWith("Referrer-Policy", "strict-origin-when-cross-origin");
    expect(res.setHeader).toHaveBeenCalledWith("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
    expect(next).toHaveBeenCalled();
  });

  it("adds Strict-Transport-Security in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    securityHeaders(req as Request, res as Response, next);
    expect(res.setHeader).toHaveBeenCalledWith("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    process.env.NODE_ENV = originalEnv;
  });

  it("does not add HSTS outside production", () => {
    process.env.NODE_ENV = "development";
    securityHeaders(req as Request, res as Response, next);
    const hstsCalls = res.setHeader.mock.calls.filter((call: any[]) => call[0] === "Strict-Transport-Security");
    expect(hstsCalls.length).toBe(0);
  });
});

describe("metricsMiddleware", () => {
  let req: any;
  let res: any;
  let next: any;
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  beforeEach(() => {
    next = vi.fn();
    req = { method: "GET", path: "/api/test", route: { path: "/api/test" } };
    listeners.clear();
    res = {
      statusCode: 200,
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(cb);
        return res;
      }),
    };
  });

  it("tracks request duration and increments counter on response finish", () => {
    metricsMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Simulate response finish
    const finishCbs = listeners.get("finish") || [];
    expect(() => {
      finishCbs.forEach((cb) => cb());
    }).not.toThrow();
  });

  it("handles missing route.path gracefully", () => {
    req.route = undefined;
    metricsMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const finishCbs = listeners.get("finish") || [];
    expect(() => {
      finishCbs.forEach((cb) => cb());
    }).not.toThrow();
  });
});
describe("requestTimeout", () => {
  let req: Partial<Request>;
  let res: any;
  let next: any;

  beforeEach(() => {
    next = vi.fn();
    req = { path: "/api/test", method: "GET" };
    res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      on: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls next immediately for normal requests", () => {
    requestTimeout(100)(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("skips timeout for health check path", () => {
    req.path = "/health";
    requestTimeout(100)(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("skips timeout for SSE stream paths", () => {
    req.path = "/api/checkpoints/stream";
    requestTimeout(100)(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 408 when request times out", () => {
    vi.useFakeTimers();
    requestTimeout(50)(req as Request, res as Response, next);
    vi.advanceTimersByTime(60);

    expect(res.status).toHaveBeenCalledWith(408);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe("REQUEST_TIMEOUT");
    expect(body.error.message).toContain("timed out");
  });

  it("cleans up timeout on response finish", () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    res.on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
      return res;
    });
    res.emit = (event: string) => {
      (listeners.get(event) || []).forEach((cb) => cb());
    };

    requestTimeout(100)(req as Request, res as Response, next);
    res.emit("finish");

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("does not send timeout if headers already sent", () => {
    vi.useFakeTimers();
    res.headersSent = true;
    requestTimeout(50)(req as Request, res as Response, next);
    vi.advanceTimersByTime(60);

    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("cacheHeaders", () => {
  let req: Partial<Request>;
  let res: any;
  let next: any;

  beforeEach(() => {
    next = vi.fn();
    req = { path: "/api/test", method: "GET" };
    res = {
      setHeader: vi.fn(),
    };
  });

  it("sets Cache-Control for GET requests", () => {
    cacheHeaders(req as Request, res as Response, next);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=60");
    expect(next).toHaveBeenCalled();
  });

  it("skips caching for non-GET requests", () => {
    req.method = "POST";
    cacheHeaders(req as Request, res as Response, next);
    expect(res.setHeader).not.toHaveBeenCalledWith("Cache-Control", expect.anything());
    expect(next).toHaveBeenCalled();
  });

  it("sets no-cache headers for no-cache paths", () => {
    req.path = "/api/checkpoints/stream";
    cacheHeaders(req as Request, res as Response, next);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    expect(res.setHeader).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(res.setHeader).toHaveBeenCalledWith("Expires", "0");
    expect(next).toHaveBeenCalled();
  });

  it("sets no-cache headers for /health", () => {
    req.path = "/health";
    cacheHeaders(req as Request, res as Response, next);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    expect(next).toHaveBeenCalled();
  });

  it("sets no-cache headers for /api/me", () => {
    req.path = "/api/me";
    cacheHeaders(req as Request, res as Response, next);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    expect(next).toHaveBeenCalled();
  });
});

describe("Custom error classes", () => {
  it("ValidationError has correct name and message", () => {
    const err = new ValidationError("Field is required");
    expect(err.name).toBe("ValidationError");
    expect(err.message).toBe("Field is required");
  });

  it("UnauthorizedError has correct name and default message", () => {
    const err = new UnauthorizedError();
    expect(err.name).toBe("UnauthorizedError");
    expect(err.message).toBe("Unauthorized");
  });

  it("UnauthorizedError accepts custom message", () => {
    const err = new UnauthorizedError("Custom auth error");
    expect(err.message).toBe("Custom auth error");
  });

  it("ForbiddenError has correct name and default message", () => {
    const err = new ForbiddenError();
    expect(err.name).toBe("ForbiddenError");
    expect(err.message).toBe("Forbidden");
  });

  it("NotFoundError has correct name and default message", () => {
    const err = new NotFoundError();
    expect(err.name).toBe("NotFoundError");
    expect(err.message).toBe("Not found");
  });
});
