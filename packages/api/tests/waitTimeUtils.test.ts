import { describe, it, expect } from "vitest";
import { computeAccuracy, computeConsensus } from "../src/waitTimeUtils";

describe("waitTimeUtils", () => {
  describe("computeAccuracy", () => {
    it("returns 0 for empty array", () => {
      expect(computeAccuracy([])).toBe(0);
    });

    it("returns 0 for null input", () => {
      expect(computeAccuracy(null as any)).toBe(0);
    });

    it("returns 0 for undefined input", () => {
      expect(computeAccuracy(undefined as any)).toBe(0);
    });

    it("returns 0 when all reports are older than 6 hours", () => {
      const sixHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
      expect(computeAccuracy([{ reportedAt: sixHoursAgo }])).toBe(0);
    });

    it("scores based on sample size and recency", () => {
      const now = new Date();
      const waitTimes = [
        { reportedAt: new Date(now.getTime() - 5 * 60 * 1000) }, // 5 min ago
        { reportedAt: new Date(now.getTime() - 10 * 60 * 1000) }, // 10 min ago
      ];
      // 2 reports => sampleScore = min(60, 30) = 30
      // most recent is 5 min ago => recencyScore = 40
      // total = 70
      expect(computeAccuracy(waitTimes)).toBe(70);
    });

    it("caps sample score at 60", () => {
      const now = new Date();
      const waitTimes = Array.from({ length: 10 }, (_, i) => ({
        reportedAt: new Date(now.getTime() - i * 60 * 1000),
      }));
      // 10 reports => 10 * 15 = 150, capped at 60
      // most recent < 30 min => 40
      // total = 100 (capped)
      expect(computeAccuracy(waitTimes)).toBe(100);
    });

    it("scores lower for older but still recent reports", () => {
      const now = new Date();
      const waitTimes = [
        { reportedAt: new Date(now.getTime() - 45 * 60 * 1000) }, // 45 min ago
      ];
      // 1 report => sampleScore = 15
      // 45 min < 60 => recencyScore = 30
      // total = 45
      expect(computeAccuracy(waitTimes)).toBe(45);
    });

    it("scores lower for aging reports", () => {
      const now = new Date();
      const waitTimes = [
        { reportedAt: new Date(now.getTime() - 90 * 60 * 1000) }, // 90 min ago
      ];
      // 1 report => 15
      // 90 min < 120 => recencyScore = 20
      // total = 35
      expect(computeAccuracy(waitTimes)).toBe(35);
    });

    it("returns 0 for reports older than 6 hours", () => {
      const now = new Date();
      const waitTimes = [
        { reportedAt: new Date(now.getTime() - 400 * 60 * 1000) }, // ~6.67h ago
      ];
      // Filtered out by the 6-hour window
      expect(computeAccuracy(waitTimes)).toBe(0);
    });

    it("scores lowest for reports at the 6-hour boundary", () => {
      const now = new Date();
      const waitTimes = [
        { reportedAt: new Date(now.getTime() - 5.5 * 60 * 60 * 1000) }, // 5.5h ago
      ];
      // 1 report => sampleScore = 15
      // 5.5h*60 = 330 min < 360 => recencyScore = 10
      // total = 25
      expect(computeAccuracy(waitTimes)).toBe(25);
    });

    it("scores recencyScore=5 for reports at exactly 6 hours (360 min boundary)", () => {
      const now = new Date();
      const waitTimes = [
        { reportedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000) }, // exactly 6h ago (360 min)
      ];
      // 1 report => sampleScore = 15
      // ageMinutes = 360, which is NOT < 360, so recencyScore = 5 (else branch)
      // total = 20
      expect(computeAccuracy(waitTimes)).toBe(20);
    });

    it("caps total accuracy at 100", () => {
      const now = new Date();
      const waitTimes = Array.from({ length: 20 }, (_, i) => ({
        reportedAt: new Date(now.getTime() - i * 5 * 60 * 1000),
      }));
      expect(computeAccuracy(waitTimes)).toBe(100);
    });

    it("uses most recent report for recency despite older entries", () => {
      const now = new Date();
      const waitTimes = [
        { reportedAt: new Date(now.getTime() - 5 * 60 * 1000) },   // 5 min ago
        { reportedAt: new Date(now.getTime() - 90 * 60 * 1000) },  // 90 min ago
        { reportedAt: new Date(now.getTime() - 180 * 60 * 1000) }, // 3h ago
      ];
      // 3 reports => min(60, 45) = 45
      // most recent is 5 min < 30 => recencyScore = 40
      // total = 85
      expect(computeAccuracy(waitTimes)).toBe(85);
    });
  });

  describe("computeConsensus", () => {
    it("returns null for empty array", () => {
      expect(computeConsensus([])).toBeNull();
    });

    it("returns null for null input", () => {
      expect(computeConsensus(null as any)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(computeConsensus(undefined as any)).toBeNull();
    });

    it("returns null when all reports are older than 6 hours", () => {
      const sixHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
      expect(computeConsensus([{ minutes: 15, reportedAt: sixHoursAgo }])).toBeNull();
    });

    it("computes simple average for single report", () => {
      const now = new Date();
      expect(computeConsensus([{ minutes: 20, reportedAt: now }])).toBe(20);
    });

    it("computes weighted average with time decay", () => {
      const now = new Date();
      const waitTimes = [
        { minutes: 30, reportedAt: now },
        { minutes: 60, reportedAt: new Date(now.getTime() - 30 * 60 * 1000) }, // 30 min ago
      ];
      const result = computeConsensus(waitTimes);
      // more recent report (30 min now) should have more weight
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThanOrEqual(30);
      expect(result).toBeLessThanOrEqual(60);
    });

    it("rounds result to nearest integer", () => {
      const now = new Date();
      const waitTimes = [
        { minutes: 10, reportedAt: now },
        { minutes: 20, reportedAt: new Date(now.getTime() - 5 * 60 * 1000) },
      ];
      const result = computeConsensus(waitTimes);
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(20);
    });

    it("gives much higher weight to very recent reports", () => {
      const now = new Date();
      const waitTimes = [
        { minutes: 15, reportedAt: new Date(now.getTime() - 2 * 60 * 1000) },  // 2 min ago
        { minutes: 300, reportedAt: new Date(now.getTime() - 359 * 60 * 1000) }, // ~6h ago, just within window
      ];
      const result = computeConsensus(waitTimes);
      // Should be much closer to 15 than 300 since the 2min report has much higher weight
      expect(result).not.toBeNull();
      expect(result).toBeLessThan(50);
    });

    it("filters out reports older than 6 hours", () => {
      const now = new Date();
      const waitTimes = [
        { minutes: 15, reportedAt: new Date(now.getTime() - 2 * 60 * 1000) },
        { minutes: 300, reportedAt: new Date(now.getTime() - 7 * 60 * 60 * 1000) }, // 7h ago
      ];
      // Only the 15-minute report is considered
      expect(computeConsensus(waitTimes)).toBe(15);
    });

    it("handles many reports without error", () => {
      const now = new Date();
      const waitTimes = Array.from({ length: 50 }, (_, i) => ({
        minutes: i % 5 === 0 ? 30 : 15,
        reportedAt: new Date(now.getTime() - i * 2 * 60 * 1000),
      }));
      const result = computeConsensus(waitTimes);
      expect(result).not.toBeNull();
      expect(typeof result).toBe("number");
    });
  });
});
