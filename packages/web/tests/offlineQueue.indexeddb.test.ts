import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fakeIndexedDB from 'fake-indexeddb';

describe('offlineQueue - IndexedDB Integration Tests', () => {
  let offlineQueue: any;
  let originalIndexedDB: IDBFactory | undefined;

  beforeEach(async () => {
    vi.resetModules();
    
    // Mock IndexedDB with fake-indexeddb
    originalIndexedDB = global.indexedDB;
    global.indexedDB = fakeIndexedDB as any;

    offlineQueue = await import('../src/lib/offlineQueue');
    await offlineQueue.clearQueue();
  });

  afterEach(async () => {
    await offlineQueue.clearQueue();
    global.indexedDB = originalIndexedDB;
    vi.restoreAllMocks();
  });

  describe('addReportToQueue with IndexedDB', () => {
    it('adds a report to the queue via IndexedDB', async () => {
      const result = await offlineQueue.addReportToQueue({
        checkpointId: 'cp-indexeddb-1',
        minutes: 25,
        source: 'crowd',
      });

      expect(result.success).toBe(true);
      expect(result.deduped).toBe(false);

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(1);
    });

    it('deduplicates reports for the same checkpoint within 5-minute window in IndexedDB', async () => {
      const report1 = {
        checkpointId: 'cp-indexeddb-dedup',
        minutes: 25,
        source: 'crowd',
      };

      const result1 = await offlineQueue.addReportToQueue(report1);
      expect(result1.success).toBe(true);
      expect(result1.deduped).toBe(false);

      const result2 = await offlineQueue.addReportToQueue(report1);
      expect(result2.success).toBe(true);
      expect(result2.deduped).toBe(true);

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(1);
    });

    it('allows reports for different checkpoints in IndexedDB', async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: 'cp-indexeddb-1',
        minutes: 25,
        source: 'crowd',
      });

      const result = await offlineQueue.addReportToQueue({
        checkpointId: 'cp-indexeddb-2',
        minutes: 30,
        source: 'crowd',
      });

      expect(result.deduped).toBe(false);

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(2);
    });

    it('respects MAX_QUEUE_SIZE limit in IndexedDB', async () => {
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

    it('generates reportedAt timestamp if not provided in IndexedDB', async () => {
      const result = await offlineQueue.addReportToQueue({
        checkpointId: 'cp-timestamp-test',
        minutes: 15,
        source: 'crowd',
      });

      expect(result.success).toBe(true);

      const reports = await offlineQueue.getPendingReports();
      expect(reports[0].reportedAt).toBeDefined();
      expect(new Date(reports[0].reportedAt).getTime()).toBeGreaterThan(Date.now() - 10000);
    });
  });

  describe('getPendingReports with IndexedDB', () => {
    it('returns empty array when queue is empty', async () => {
      const reports = await offlineQueue.getPendingReports();
      expect(reports).toEqual([]);
    });

    it('returns all pending reports from IndexedDB', async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: 'cp-idx-1',
        minutes: 25,
        source: 'crowd',
      });
      await offlineQueue.addReportToQueue({
        checkpointId: 'cp-idx-2',
        minutes: 30,
        source: 'official',
      });

      const reports = await offlineQueue.getPendingReports();
      expect(reports.length).toBe(2);
      expect(reports.map(r => r.checkpointId)).toContain('cp-idx-1');
      expect(reports.map(r => r.checkpointId)).toContain('cp-idx-2');
    });

    it('includes timestamp and retryCount in reports from IndexedDB', async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: 'cp-idx-3',
        minutes: 25,
        source: 'crowd',
      });

      const reports = await offlineQueue.getPendingReports();
      expect(reports[0].timestamp).toBeDefined();
      expect(reports[0].timestamp).toBeGreaterThan(Date.now() - 1000);
      expect(reports[0].retryCount).toBe(0);
    });
  });

  describe('removeReportFromQueue with IndexedDB', () => {
    it('removes a report by id from IndexedDB', async () => {
      const result = await offlineQueue.addReportToQueue({
        checkpointId: 'cp-remove-idx-1',
        minutes: 25,
        source: 'crowd',
      });

      const reports = await offlineQueue.getPendingReports();
      const reportId = reports[0].id!;

      await offlineQueue.removeReportFromQueue(reportId);

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(0);
    });

    it('does nothing if report id does not exist in IndexedDB', async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: 'cp-safe-idx-1',
        minutes: 25,
        source: 'crowd',
      });

      const initialCount = await offlineQueue.getQueueCount();

      await offlineQueue.removeReportFromQueue(99999);

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(initialCount);
    });
  });

  describe('updateReportRetry with IndexedDB', () => {
    it('increments retry count for a report in IndexedDB', async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: 'cp-retry-idx-1',
        minutes: 25,
        source: 'crowd',
      });

      const reports = await offlineQueue.getPendingReports();
      const reportId = reports[0].id!;

      await offlineQueue.updateReportRetry(reportId);

      const updatedReports = await offlineQueue.getPendingReports();
      expect(updatedReports[0].retryCount).toBe(1);
    });

    it('can increment retry count multiple times in IndexedDB', async () => {
      await offlineQueue.addReportToQueue({
        checkpointId: 'cp-retry-idx-2',
        minutes: 25,
        source: 'crowd',
      });

      const reports = await offlineQueue.getPendingReports();
      const reportId = reports[0].id!;

      await offlineQueue.updateReportRetry(reportId);
      await offlineQueue.updateReportRetry(reportId);
      await offlineQueue.updateReportRetry(reportId);

      const updatedReports = await offlineQueue.getPendingReports();
      expect(updatedReports[0].retryCount).toBe(3);
    });

    it('handles non-existent report gracefully in IndexedDB', async () => {
      await expect(offlineQueue.updateReportRetry(99999)).resolves.toBeUndefined();
    });
  });

describe('clearQueue with IndexedDB', () => {
    it('removes all reports from IndexedDB queue', async () => {
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-clear-1', minutes: 25, source: 'crowd' });
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-clear-2', minutes: 30, source: 'crowd' });

      const initialCount = await offlineQueue.getQueueCount();
      expect(initialCount).toBe(2);

      await offlineQueue.clearQueue();

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(0);
    });

    it('resets the nextId counter in memory fallback (IndexedDB uses auto-increment)', async () => {
      // In IndexedDB, the auto-increment key is not reset by clear()
      // This test verifies the queue is cleared
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-reset-1', minutes: 25, source: 'crowd' });
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-reset-2', minutes: 30, source: 'crowd' });

      await offlineQueue.clearQueue();

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(0);
      
      // Adding a new report should work
      const newResult = await offlineQueue.addReportToQueue({ checkpointId: 'cp-reset-3', minutes: 35, source: 'crowd' });
      expect(newResult.success).toBe(true);
    });
  });

  describe('getQueueCount with IndexedDB', () => {
    it('returns 0 for empty queue', async () => {
      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(0);
    });

    it('returns correct count for non-empty queue', async () => {
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-count-idx-1', minutes: 25, source: 'crowd' });
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-count-idx-2', minutes: 30, source: 'crowd' });
      await offlineQueue.addReportToQueue({ checkpointId: 'cp-count-idx-3', minutes: 35, source: 'crowd' });

      const count = await offlineQueue.getQueueCount();
      expect(count).toBe(3);
    });
  });

  describe('constants', () => {
    it('exports MAX_QUEUE_SIZE', async () => {
      expect(offlineQueue.MAX_QUEUE_SIZE).toBe(50);
    });

    it('exports MAX_RETRIES', async () => {
      expect(offlineQueue.MAX_RETRIES).toBe(3);
    });
  });

  describe('getMaxRetries and getMaxQueueSize', () => {
    it('returns MAX_RETRIES constant', async () => {
      const maxRetries = await offlineQueue.getMaxRetries();
      expect(maxRetries).toBe(3);
    });

    it('returns MAX_QUEUE_SIZE constant', async () => {
      const maxSize = await offlineQueue.getMaxQueueSize();
      expect(maxSize).toBe(50);
    });
  });
});