import { describe, it, expect, beforeEach } from 'vitest';
import {
  addReportToQueue,
  getPendingReports,
  removeReportFromQueue,
  clearQueue,
  getQueueCount,
} from '../src/lib/offlineQueue';

describe('Offline Queue Integration', () => {
  beforeEach(async () => {
    await clearQueue();
  });

  it('simulates full offline-to-online flow', async () => {
    // Simulate being offline and queuing multiple reports
    await addReportToQueue({ checkpointId: 'cp-1', minutes: 15, source: 'crowd' });
    await addReportToQueue({ checkpointId: 'cp-2', minutes: 30, source: 'crowd' });
    await addReportToQueue({ checkpointId: 'cp-3', minutes: 45, source: 'official' });

    const pending = await getPendingReports();
    expect(pending).toHaveLength(3);

    // Simulate coming back online and syncing
    // In real app, this would POST to API, here we just simulate success
    const syncedIds: number[] = [];
    for (const report of pending) {
      // Simulate successful API call
      const success = true;
      if (success) {
        syncedIds.push(report.id!);
      }
    }

    // Remove synced reports
    for (const id of syncedIds) {
      await removeReportFromQueue(id);
    }

    const remaining = await getPendingReports();
    expect(remaining).toHaveLength(0);
  });

  it('handles queue operations in sequence', async () => {
    const count1 = await getQueueCount();
    expect(count1).toBe(0);

    await addReportToQueue({ checkpointId: 'test-cp', minutes: 20, source: 'crowd' });
    const count2 = await getQueueCount();
    expect(count2).toBe(1);

    await addReportToQueue({ checkpointId: 'test-cp-2', minutes: 25, source: 'crowd' });
    const count3 = await getQueueCount();
    expect(count3).toBe(2);

    const reports = await getPendingReports();
    expect(reports[0].minutes).toBe(20);
    expect(reports[1].minutes).toBe(25);

    await removeReportFromQueue(reports[0].id!);
    const count4 = await getQueueCount();
    expect(count4).toBe(1);

    await clearQueue();
    const count5 = await getQueueCount();
    expect(count5).toBe(0);
  });

  it('preserves report metadata', async () => {
    const testTime = Date.now();
    await addReportToQueue({
      checkpointId: 'airport-checkpoint-123',
      minutes: 60,
      source: 'crowd',
    });

    const reports = await getPendingReports();
    expect(reports).toHaveLength(1);

    const report = reports[0];
    expect(report.checkpointId).toBe('airport-checkpoint-123');
    expect(report.minutes).toBe(60);
    expect(report.source).toBe('crowd');
    expect(report.timestamp).toBeGreaterThanOrEqual(testTime);
    expect(report.id).toBeDefined();
  });

  it('handles empty queue gracefully', async () => {
    const emptyReports = await getPendingReports();
    expect(emptyReports).toEqual([]);

    const emptyCount = await getQueueCount();
    expect(emptyCount).toBe(0);

    // Clearing empty queue should not error
    await clearQueue();
    expect(true).toBe(true);
  });

  it('supports different report sources', async () => {
    // Use different checkpointIds to avoid deduplication
    await addReportToQueue({ checkpointId: 'cp-crowd', minutes: 10, source: 'crowd' });
    await addReportToQueue({ checkpointId: 'cp-official', minutes: 20, source: 'official' });
    await addReportToQueue({ checkpointId: 'cp-pattern', minutes: 30, source: 'pattern' });

    const reports = await getPendingReports();
    const sources = reports.map(r => r.source);

    expect(sources).toContain('crowd');
    expect(sources).toContain('official');
    expect(sources).toContain('pattern');
  });
});