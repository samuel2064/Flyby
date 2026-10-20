import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('offlineQueue - In-Memory Fallback Tests', () => {
  let offlineQueue: any;

  beforeEach(async () => {
    vi.resetModules();
    offlineQueue = await import('../src/lib/offlineQueue');
    await offlineQueue.clearQueue();
  });

  afterEach(async () => {
    await offlineQueue.clearQueue();
  });

  describe('clearQueue in memory fallback', () => {
    it('clears in-memory store', async () => {
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-node-1', minutes: 25, source: 'crowd' });
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-node-2', minutes: 30, source: 'crowd' });

      let count = await offlineQueue.getQueueCount();
      expect(count).toBe(2);

      await offlineQueue.clearQueue();

      count = await offlineQueue.getQueueCount();
      expect(count).toBe(0);
    });

    it('resets nextId counter after clear', async () => {
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-reset-1', minutes: 10, source: 'crowd' });
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-reset-2', minutes: 20, source: 'crowd' });

      let reports = await offlineQueue.getPendingReports();
      const firstId = reports[0].id;

      await offlineQueue.clearQueue();

      await offlineQueue.addReportToQueue({ checkpointId: 'cp-reset-3', minutes: 30, source: 'crowd' });
      reports = await offlineQueue.getPendingReports();

      expect(reports[0].id).toBe(firstId);
    });
  });

  describe('getQueueCount in memory fallback', () => {
    it('returns correct count from in-memory store', async () => {
      const count1 = await offlineQueue.getQueueCount();
      expect(count1).toBe(0);

      await offlineQueue.addReportToQueue({ checkpointId: 'cp-count-1', minutes: 15, source: 'crowd' });
      const count2 = await offlineQueue.getQueueCount();
      expect(count2).toBe(1);

      await offlineQueue.addReportToQueue({ checkpointId: 'cp-count-2', minutes: 25, source: 'crowd' });
      const count3 = await offlineQueue.getQueueCount();
      expect(count3).toBe(2);
    });

    it('returns 0 for empty queue', async () => {
      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(0);
    });
  });

  describe('removeReportFromQueue in memory fallback', () => {
    it('removes report from in-memory store', async () => {
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-remove-1', minutes: 15, source: 'crowd' });
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-remove-2', minutes: 25, source: 'crowd' });

      const reports = await offlineQueue.getPendingReports();
      const reportId = reports[0].id!;

      await offlineQueue.removeReportFromQueue(reportId);

      const remaining = await offlineQueue.getPendingReports();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).not.toBe(reportId);
    });

    it('handles removing non-existent report gracefully', async () => {
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-safe-1', minutes: 15, source: 'crowd' });
      const initialCount = await offlineQueue.getQueueCount();

      await offlineQueue.removeReportFromQueue(99999);

      const countAfter = await offlineQueue.getQueueCount();
      expect(countAfter).toBe(initialCount);
    });
  });

  describe('updateReportRetry in memory fallback', () => {
    it('increments retry count in in-memory store', async () => {
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-retry-1', minutes: 15, source: 'crowd' });

      const reports = await offlineQueue.getPendingReports();
      const reportId = reports[0].id!;

      await offlineQueue.updateReportRetry(reportId);

      const updated = await offlineQueue.getPendingReports();
      expect(updated[0].retryCount).toBe(1);
    });

    it('handles non-existent report gracefully', async () => {
      await expect(offlineQueue.updateReportRetry(99999)).resolves.toBeUndefined();
    });
  });

  describe('addReportToQueue in memory fallback', () => {
    it('adds report to in-memory store', async () => {
      const result = await offlineQueue.addReportToQueue({
        checkpointId: 'cp-inmem-1',
        minutes: 20,
        source: 'crowd',
      });

      expect(result.success).toBe(true);
      expect(result.deduped).toBe(false);

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(1);
    });

    it('deduplicates in in-memory store', async () => {
      const result1 = await offlineQueue.addReportToQueue({
        checkpointId: 'cp-dedup-1',
        minutes: 20,
        source: 'crowd',
      });
      expect(result1.deduped).toBe(false);

      const result2 = await offlineQueue.addReportToQueue({
        checkpointId: 'cp-dedup-1',
        minutes: 25,
        source: 'crowd',
      });
      expect(result2.deduped).toBe(true);

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(1);
    });

    it('enforces queue size limit in memory', async () => {
      const MAX_QUEUE_SIZE = 50;

      for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
        await offlineQueue.addReportToQueue({
          checkpointId: `cp-limit-${i}`,
          minutes: 10,
          source: 'crowd',
        });
      }

      const result = await offlineQueue.addReportToQueue({
        checkpointId: 'cp-over-limit',
        minutes: 10,
        source: 'crowd',
      });

      expect(result.success).toBe(false);
      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(MAX_QUEUE_SIZE);
    });
  });
});