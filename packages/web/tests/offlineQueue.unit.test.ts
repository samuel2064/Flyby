import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  addReportToQueue,
  getPendingReports,
  removeReportFromQueue,
  updateReportRetry,
  getQueueCount,
  clearQueue,
  MAX_QUEUE_SIZE,
  MAX_RETRIES,
} from "../src/lib/offlineQueue";

describe("offlineQueue", () => {
  beforeEach(async () => {
    await clearQueue();
  });

  afterEach(async () => {
    await clearQueue();
  });

  describe("addReportToQueue", () => {
    it("adds a report to the queue", async () => {
      const result = await addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
      });

      expect(result.success).toBe(true);
      expect(result.deduped).toBe(false);

      const count = await getQueueCount();
      expect(count).toBe(1);
    });

    it("deduplicates reports for the same checkpoint within 5-minute window", async () => {
      const report1 = {
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
      };

      const result1 = await addReportToQueue(report1);
      expect(result1.success).toBe(true);
      expect(result1.deduped).toBe(false);

      const result2 = await addReportToQueue(report1);
      expect(result2.success).toBe(true);
      expect(result2.deduped).toBe(true);

      const count = await getQueueCount();
      expect(count).toBe(1);
    });

    it("allows reports for different checkpoints", async () => {
      await addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
      });

      const result = await addReportToQueue({
        checkpointId: "cp-2",
        minutes: 30,
        source: "crowd",
      });

      expect(result.deduped).toBe(false);

      const count = await getQueueCount();
      expect(count).toBe(2);
    });

    it("respects MAX_QUEUE_SIZE limit", async () => {
      // Fill the queue to max
      for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
        await addReportToQueue({
          checkpointId: `cp-${i}`,
          minutes: 25,
          source: "crowd",
        });
      }

      // Try to add one more
      const result = await addReportToQueue({
        checkpointId: "cp-new",
        minutes: 30,
        source: "crowd",
      });

      expect(result.success).toBe(false);
      expect(result.deduped).toBe(false);
    });
  });

  describe("getPendingReports", () => {
    it("returns empty array when queue is empty", async () => {
      const reports = await getPendingReports();
      expect(reports).toEqual([]);
    });

    it("returns all pending reports", async () => {
      await addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
      });
      await addReportToQueue({
        checkpointId: "cp-2",
        minutes: 30,
        source: "official",
      });

      const reports = await getPendingReports();
      expect(reports.length).toBe(2);
      expect(reports.map(r => r.checkpointId)).toContain("cp-1");
      expect(reports.map(r => r.checkpointId)).toContain("cp-2");
    });

    it("includes timestamp and retryCount in reports", async () => {
      await addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
      });

      const reports = await getPendingReports();
      expect(reports[0].timestamp).toBeDefined();
      expect(reports[0].timestamp).toBeGreaterThan(Date.now() - 1000);
      expect(reports[0].retryCount).toBe(0);
    });
  });

  describe("removeReportFromQueue", () => {
    it("removes a report by id", async () => {
      const result = await addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
      });

      const reports = await getPendingReports();
      const reportId = reports[0].id!;

      await removeReportFromQueue(reportId);

      const count = await getQueueCount();
      expect(count).toBe(0);
    });

    it("does nothing if report id doesn't exist", async () => {
      await addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
      });

      const initialCount = await getQueueCount();

      await removeReportFromQueue(99999);

      const count = await getQueueCount();
      expect(count).toBe(initialCount);
    });
  });

  describe("updateReportRetry", () => {
    it("increments retry count for a report", async () => {
      await addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
      });

      const reports = await getPendingReports();
      const reportId = reports[0].id!;

      await updateReportRetry(reportId);

      const updatedReports = await getPendingReports();
      expect(updatedReports[0].retryCount).toBe(1);
    });

    it("can increment retry count multiple times", async () => {
      await addReportToQueue({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
      });

      const reports = await getPendingReports();
      const reportId = reports[0].id!;

      await updateReportRetry(reportId);
      await updateReportRetry(reportId);
      await updateReportRetry(reportId);

      const updatedReports = await getPendingReports();
      expect(updatedReports[0].retryCount).toBe(3);
    });
  });

  describe("getQueueCount", () => {
    it("returns 0 for empty queue", async () => {
      const count = await getQueueCount();
      expect(count).toBe(0);
    });

    it("returns correct count for non-empty queue", async () => {
      await addReportToQueue({ checkpointId: "cp-1", minutes: 25, source: "crowd" });
      await addReportToQueue({ checkpointId: "cp-2", minutes: 30, source: "crowd" });
      await addReportToQueue({ checkpointId: "cp-3", minutes: 35, source: "crowd" });

      const count = await getQueueCount();
      expect(count).toBe(3);
    });
  });

  describe("clearQueue", () => {
    it("removes all reports from queue", async () => {
      await addReportToQueue({ checkpointId: "cp-1", minutes: 25, source: "crowd" });
      await addReportToQueue({ checkpointId: "cp-2", minutes: 30, source: "crowd" });

      const initialCount = await getQueueCount();
      expect(initialCount).toBe(2);

      await clearQueue();

      const count = await getQueueCount();
      expect(count).toBe(0);
    });

    it("resets the nextId counter", async () => {
      await addReportToQueue({ checkpointId: "cp-1", minutes: 25, source: "crowd" });
      await addReportToQueue({ checkpointId: "cp-2", minutes: 30, source: "crowd" });

      await clearQueue();

      const newResult = await addReportToQueue({ checkpointId: "cp-3", minutes: 35, source: "crowd" });
      const reports = await getPendingReports();
      // After clear, nextId should reset to 1
      expect(reports[0].id).toBe(1);
    });
  });

  describe("constants", () => {
    it("exports MAX_QUEUE_SIZE", async () => {
      expect(MAX_QUEUE_SIZE).toBe(50);
    });

    it("exports MAX_RETRIES", async () => {
      expect(MAX_RETRIES).toBe(3);
    });
  });
});