import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("offlineQueue library", () => {
  let offlineQueue: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module registry to get fresh state
    vi.resetModules();
    offlineQueue = await import("../src/lib/offlineQueue");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("addReportToQueue", () => {
    it("adds report to queue successfully", async () => {
      const result = await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      expect(result.success).toBe(true);
      expect(result.deduped).toBe(false);
    });

    it("deduplicates reports within 5-minute window", async () => {
      const report1 = await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      // Same checkpoint, within 5 minutes
      const report2 = await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 30,
        source: "crowd",
        reportedAt: "2026-07-16T10:02:00Z",
      });

      expect(report1.success).toBe(true);
      expect(report2.deduped).toBe(true);
    });

    it("rejects when queue exceeds max size", async () => {
      // Fill queue to max
      for (let i = 0; i < offlineQueue.MAX_QUEUE_SIZE; i++) {
        await offlineQueue.addReportToQueue({
          checkpointId: `cp-${i}`,
          minutes: 15,
          source: "crowd",
          reportedAt: new Date().toISOString(),
        });
      }

      const result = await offlineQueue.addReportToQueue({
        checkpointId: "cp-new",
        minutes: 20,
        source: "crowd",
        reportedAt: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
    });

    it("generates reportedAt timestamp if not provided", async () => {
      const result = await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 15,
        source: "crowd",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("getPendingReports", () => {
    it("returns empty array when queue is empty", async () => {
      const reports = await offlineQueue.getPendingReports();
      expect(reports).toEqual([]);
    });

    it("returns all pending reports", async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      await offlineQueue.addReportToQueue({
        checkpointId: "cp-2",
        minutes: 30,
        source: "crowd",
        reportedAt: "2026-07-16T10:05:00Z",
      });

      const reports = await offlineQueue.getPendingReports();
      expect(reports.length).toBe(2);
      expect(reports[0].checkpointId).toBe("cp-1");
      expect(reports[1].checkpointId).toBe("cp-2");
    });
  });

  describe("removeReportFromQueue", () => {
    it("removes report by id", async () => {
      const result = await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      const reports = await offlineQueue.getPendingReports();
      const id = reports[0].id;
      expect(id).toBeDefined();

      await offlineQueue.removeReportFromQueue(id!);

      const remaining = await offlineQueue.getPendingReports();
      expect(remaining.length).toBe(0);
    });

    it("handles removal of non-existent id gracefully", async () => {
      await expect(offlineQueue.removeReportFromQueue(999)).resolves.not.toThrow();
    });
  });

  describe("updateReportRetry", () => {
    it("increments retry count", async () => {
      const reports = await offlineQueue.getPendingReports();
      
      // Add a report first
      const addResult = await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      const updatedReports = await offlineQueue.getPendingReports();
      const id = updatedReports[0].id;
      expect(id).toBeDefined();

      await offlineQueue.updateReportRetry(id!);

      const afterUpdate = await offlineQueue.getPendingReports();
      expect(afterUpdate[0].retryCount).toBe(1);
    });

    it("handles non-existent id gracefully", async () => {
      await expect(offlineQueue.updateReportRetry(999)).resolves.not.toThrow();
    });

    it("increments retry count multiple times", async () => {
      const addResult = await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      const reports = await offlineQueue.getPendingReports();
      const id = reports[0].id;

      await offlineQueue.updateReportRetry(id!);
      await offlineQueue.updateReportRetry(id!);
      await offlineQueue.updateReportRetry(id!);

      const afterUpdates = await offlineQueue.getPendingReports();
      expect(afterUpdates[0].retryCount).toBe(3);
    });
  });

  describe("clearQueue", () => {
    it("removes all reports from queue", async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      await offlineQueue.addReportToQueue({
        checkpointId: "cp-2",
        minutes: 30,
        source: "crowd",
        reportedAt: "2026-07-16T10:05:00Z",
      });

      await offlineQueue.clearQueue();

      const reports = await offlineQueue.getPendingReports();
      expect(reports.length).toBe(0);
    });

    it("resets id counter", async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      await offlineQueue.clearQueue();

      const newReport = await offlineQueue.addReportToQueue({
        checkpointId: "cp-2",
        minutes: 30,
        source: "crowd",
        reportedAt: "2026-07-16T10:05:00Z",
      });

      const reports = await offlineQueue.getPendingReports();
      expect(reports[0].id).toBe(1);
    });
  });

  describe("getQueueCount", () => {
    it("returns 0 when queue is empty", async () => {
      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(0);
    });

    it("returns correct count after adding reports", async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      await offlineQueue.addReportToQueue({
        checkpointId: "cp-2",
        minutes: 30,
        source: "crowd",
        reportedAt: "2026-07-16T10:05:00Z",
      });

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(2);
    });

    it("returns correct count after removing reports", async () => {
      const addResult = await offlineQueue.addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: "2026-07-16T10:00:00Z",
      });

      const reports = await offlineQueue.getPendingReports();
      await offlineQueue.removeReportFromQueue(reports[0].id!);

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(0);
    });
  });

  describe("getMaxRetries", () => {
    it("returns MAX_RETRIES constant", async () => {
      const maxRetries = await offlineQueue.getMaxRetries();
      expect(maxRetries).toBe(3);
    });
  });

  describe("getMaxQueueSize", () => {
    it("returns MAX_QUEUE_SIZE constant", async () => {
      const maxSize = await offlineQueue.getMaxQueueSize();
      expect(maxSize).toBe(50);
    });
  });
});