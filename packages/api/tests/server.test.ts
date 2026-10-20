import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("server.ts graceful shutdown", () => {
  let serverSource: string;

  beforeEach(() => {
    const serverPath = path.join(__dirname, "..", "src", "server.ts");
    serverSource = fs.readFileSync(serverPath, "utf-8");
  });

  it("contains SIGTERM handler registration", () => {
    expect(serverSource).toContain('process.on("SIGTERM"');
  });

  it("contains SIGINT handler registration", () => {
    expect(serverSource).toContain('process.on("SIGINT"');
  });

  it("contains unhandledRejection handler registration", () => {
    expect(serverSource).toContain('process.on("unhandledRejection"');
  });

  it("contains uncaughtException handler registration", () => {
    expect(serverSource).toContain('process.on("uncaughtException"');
  });

  it("contains graceful shutdown function that closes server", () => {
    expect(serverSource).toContain("server.close");
  });

  it("contains Prisma disconnection in shutdown", () => {
    expect(serverSource).toContain("prisma.$disconnect");
  });

  it("contains Redis disconnection in shutdown", () => {
    expect(serverSource).toContain("redisClient.quit");
  });

  it("contains process.exit(0) after shutdown completes", () => {
    expect(serverSource).toContain("process.exit(0)");
  });

  it("contains error handling for Prisma disconnection", () => {
    expect(serverSource).toMatch(/try\s*{[\s\S]*prisma\.\$disconnect[\s\S]*}\s*catch/);
  });

  it("contains error handling for Redis disconnection", () => {
    expect(serverSource).toMatch(/try\s*{[\s\S]*redisClient\.quit[\s\S]*}\s*catch/);
  });

  it("logs unhandled rejection", () => {
    expect(serverSource).toContain('console.error("Unhandled Rejection:"');
  });

  it("logs uncaught exception", () => {
    expect(serverSource).toContain('console.error("Uncaught Exception:"');
  });

  it("exits after timeout on uncaught exception", () => {
    expect(serverSource).toMatch(/setTimeout\s*\(\s*\(\s*\)\s*=>\s*process\.exit\s*\(\s*1\s*\)/);
  });
});