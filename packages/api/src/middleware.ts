import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { redisClient } from "./redis";

interface CacheRequest extends Request {
  cacheDuration?: string | number;
}

/* ------------------------------------------------------------------ */
/* 1. Structured request logging                                      */
/* ------------------------------------------------------------------ */

/** Fields to strip from logged headers for privacy */
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-session-id",
  "set-cookie",
]);

/** Sanitise a header object by redacting sensitive keys */
function sanitiseHeaders(headers: Record<string, string | string[] | undefined>) {
  const safe: Record<string, string | string[]> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      safe[key] = "[REDACTED]";
    } else if (val !== undefined) {
      safe[key] = val;
    }
  }
  return safe;
}

/** Express middleware that logs every HTTP request as a single JSON line */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Skip noisy /health and static-asset requests
  if (req.path === "/health" || req.path.startsWith("/favicon") || req.path.startsWith("/sw.js")) {
    return next();
  }
  // Skip in test environment to avoid polluting test output
  if (process.env.NODE_ENV === "test") {
    return next();
  }

  const start = process.hrtime.bigint();

  function logRequest() {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(3)),
      ip: req.ip,
      user_agent: req.headers["user-agent"],
      session_id: req.headers["x-session-id"] ? "[REDACTED]" : undefined,
      headers: sanitiseHeaders(req.headers as Record<string, string | string[]>),
    };
    console.log(JSON.stringify(logEntry));
    res.removeListener("finish", logRequest);
    res.removeListener("close", logRequest);
  }

  res.on("finish", logRequest);
  res.on("close", logRequest); // connection dropped
  next();
}

/* ------------------------------------------------------------------ */
/* 2. Comprehensive health check                                    */
/* ------------------------------------------------------------------ */

interface HealthStatus {
  status: "ok" | "degraded" | "unhealthy";
  timestamp: string;
  uptime_seconds: number;
  environment: string;
  version: string;
  services: {
    database: "ok" | "error";
    redis: "ok" | "error";
  };
}

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const result: HealthStatus = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "0.1.0",
    services: {
      database: "error",
      redis: "error",
    },
  };

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    result.services.database = "ok";
  } catch (err) {
    console.error("Health check: database connection failed", err);
    result.services.database = "error";
    result.status = "unhealthy";
  }

  // Check Redis
  try {
    if (redisClient) {
      await redisClient.ping();
    }
    result.services.redis = "ok";
  } catch (err) {
    console.error("Health check: redis connection failed", err);
    result.services.redis = "error";
    result.status = "unhealthy";
  }

  // If any service failed, mark degraded (not fully unhealthy unless all down)
  if (result.services.database === "error" || result.services.redis === "error") {
    result.status = result.services.database === "error" && result.services.redis === "error" ? "unhealthy" : "degraded";
  }

  const httpStatus = result.status === "unhealthy" ? 503 : 200;
  res.status(httpStatus).json(result);
}

/* ------------------------------------------------------------------ */
/* 3. Global error handler                                            */
/* ------------------------------------------------------------------ */

/** Express error handler that normalizes error responses */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Log error details in development
  if (process.env.NODE_ENV !== "production") {
    console.error("Unhandled error:", err);
  }

  // Default error values
  let statusCode = 500;
  let message = "Internal server error";
  let code = "INTERNAL_ERROR";

  // Handle known error types
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = err.message;
    code = "VALIDATION_ERROR";
  } else if (err.name === "UnauthorizedError") {
    statusCode = 401;
    message = "Unauthorized";
    code = "UNAUTHORIZED";
  } else if (err.name === "ForbiddenError") {
    statusCode = 403;
    message = "Forbidden";
    code = "FORBIDDEN";
  } else if (err.name === "NotFoundError") {
    statusCode = 404;
    message = "Resource not found";
    code = "NOT_FOUND";
  } else if (err.name === "PrismaClientKnownRequestError") {
    // Handle Prisma errors by code
    const prismaErr = err as Prisma.PrismaClientKnownRequestError;
    switch (prismaErr.code) {
      case "P2002": // Unique constraint violation
        statusCode = 409;
        message = "Duplicate entry";
        code = "CONFLICT_ERROR";
        break;
      case "P2003": // Foreign key constraint violation
        statusCode = 400;
        message = "Referenced record not found";
        code = "FOREIGN_KEY_ERROR";
        break;
      case "P2014": // Database schema mismatch
      case "P2015": // Model doesn't exist
      case "P2016": // No such model
      case "P2017": // Invalid null value
      case "P2018": // Missing required field
      case "P2019": // Transaction failed
      case "P2020": // Row did not lock
      case "P2021": // Scalar field too short
      case "P2022": // Scalar field too long
      case "P2023": // Too many rows returned
      case "P2025": // Record to update not found
      case "P2026": // Row did not exist at the found position
      case "P2027": // disconnected from the database
      case "P2028": // Failed to load external database
      case "P2032": // Tuple column count mismatch
      case "P2033": // Failed to parse the query
        statusCode = 400;
        message = "Database error";
        code = "DATABASE_ERROR";
        break;
      default:
        statusCode = 400;
        message = "Database error";
        code = "DATABASE_ERROR";
    }
  } else if (err.name === "ZodError") {
    // Handle Zod validation errors with field-level details
    const zodErr = err as import("zod").ZodError;
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Validation error";
    // Include first issue detail in message for simplicity
    if (zodErr.issues && zodErr.issues.length > 0) {
      const firstIssue = zodErr.issues[0];
      message += `: ${firstIssue.path.join(".")} - ${firstIssue.message}`;
    }
  } else if (err.name === "JsonParseError") {
    statusCode = 400;
    message = "Invalid JSON payload";
    code = "PARSE_ERROR";
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  });
}

/* ------------------------------------------------------------------ */
/* 4. Response cache headers middleware                              */
/* ------------------------------------------------------------------ */

/** Express middleware that sets cache control headers for API responses */
export function cacheHeaders(req: CacheRequest, res: Response, next: NextFunction): void {
  // Don't cache non-GET / non-HEAD requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  // Never cache health checks, stream endpoints, or auth routes
  const noCachePaths = ["/health", "/metrics", "/api/me", "/api/reports", "/api/checkpoints/stream"];
  const isNoCache = noCachePaths.some((p) => req.path === p || req.path.startsWith(p));
  if (isNoCache || req.path.endsWith("/stream")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return next();
  }

const cacheDuration = req.cacheDuration != null ? 
    isNaN(parseInt(req.cacheDuration as string, 10)) ? 60 : parseInt(req.cacheDuration as string, 10) 
    : 60;
  res.setHeader("Cache-Control", `public, max-age=${cacheDuration !== 0 ? cacheDuration : 60}`);
  next();
}

/* ------------------------------------------------------------------ */
/* 5. Security headers middleware                                    */
/* ------------------------------------------------------------------ */

/** Express middleware that adds common security headers */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // XSS protection (legacy, but still useful)
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Strict transport security (only in production)
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  next();
}

/* ------------------------------------------------------------------ */
/* 5. Request timeout middleware                                      */
/* ------------------------------------------------------------------ */

/** Factory that returns a timeout middleware.
 *  SSE and streaming routes should skip this by setting req.setTimeout(0) or by ordering middleware.
 */
export function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip timeout for health checks and SSE streams
    const isHealth = req.path === "/health";
    const isStream = req.path.endsWith("/stream");
    if (isHealth || isStream) {
      return next();
    }
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: {
            code: "REQUEST_TIMEOUT",
            message: `Request timed out after ${ms}ms`,
            timestamp: new Date().toISOString(),
            path: req.path,
          },
        });
      }
    }, ms);

    res.on("finish", () => clearTimeout(timeoutId));
    res.on("close", () => clearTimeout(timeoutId));
    next();
  };
}

/* ------------------------------------------------------------------ */
/* 6. Custom error classes                                            */
/* ------------------------------------------------------------------ */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Cannot ${req.method} ${req.path}`,
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Express 4 async-handler safety (TIR-339 / post-vapid hardening)     */
/* ------------------------------------------------------------------ */

const ROUTE_METHODS = ["get", "post", "put", "patch", "delete", "all", "use"] as const;
type RouteMethod = (typeof ROUTE_METHODS)[number];

/**
 * Express 4 does not forward rejected promises from async route handlers to
 * the error middleware: the rejection escapes as an unhandledRejection and
 * the request hangs until the client (or a proxy timeout) gives up - no 500,
 * no error metric, no errorHandler log. This is exactly how the vapid-key
 * route hung when the TIR-339 contract corpus hit it unmocked.
 *
 * catchAsyncRoutes patches the app's route-registration methods ONCE, right
 * after app creation, so every handler registered afterwards (native,
 * compat, or late-mounted) forwards both sync throws and rejected promises
 * to next(err). Error handlers (arity 4) pass through untouched; errorHandler
 * already guards res.headersSent, so late rejections are safe to forward.
 *
 * Accepts Express `app` AND `Router` instances (Router instances register
 * through their own route methods, which app-level patching cannot reach -
 * every Router in src/ must call this at creation, see usersRouter.ts).
 * The `object -> patchable` cast is the single deliberate type boundary:
 * Express's overloaded method types cannot be expressed structurally.
 */
export function catchAsyncRoutes(app: object): void {
  const patchable = app as unknown as Record<RouteMethod, (...args: unknown[]) => unknown>;
  for (const method of ROUTE_METHODS) {
    const original = patchable[method].bind(patchable);
    Object.defineProperty(patchable, method, {
      value: (...args: unknown[]) => {
        const wrapped = args.map((arg) => {
          if (typeof arg !== "function") return arg; // path prefixes, options
          const fn = arg as (req: Request, res: Response, next: NextFunction) => unknown;
          if (fn.length >= 4) return arg; // (err, req, res, next) error handlers
          return (req: Request, res: Response, next: NextFunction): void => {
            try {
              const out = fn(req, res, next);
              if (out instanceof Promise) out.catch(next);
            } catch (err) {
              next(err as Error);
            }
          };
        });
        return original(...wrapped);
      },
      writable: true,
      configurable: true,
    });
  }
}
