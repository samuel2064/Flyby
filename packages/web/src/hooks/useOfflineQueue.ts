import { useState, useEffect, useCallback, useRef } from 'react';
import {
  addReportToQueue,
  getPendingReports,
  removeReportFromQueue,
  getQueueCount,
  updateReportRetry,
  MAX_RETRIES,
} from '../lib/offlineQueue';

export interface SyncedReport {
  checkpointId: string;
  minutes: number;
  source: string;
  reportedAt: string;
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);
  const mountedRef = useRef(true);
  const syncInProgressRef = useRef(false);

  // Update online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load pending count
  const loadPendingCount = useCallback(async () => {
    try {
      const count = await getQueueCount();
      if (!mountedRef.current) return;
      setPendingCount(count);
    } catch (error) {
      console.error('Failed to load pending count:', error);
    }
  }, []);

  useEffect(() => {
    void loadPendingCount();
  }, [loadPendingCount]);

  // Sync queue when back online with retry logic
  const syncQueue = useCallback(async (submitReport: (report: SyncedReport) => Promise<boolean>) => {
    if (!isOnline || syncingRef.current || syncInProgressRef.current) return;

    syncInProgressRef.current = true;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const pending = await getPendingReports();
      const synced: number[] = [];
      const failed: number[] = [];

      for (const report of pending) {
        const success = await submitReport({
          checkpointId: report.checkpointId,
          minutes: report.minutes,
          source: report.source,
          reportedAt: report.reportedAt,
        });
        if (success) {
          synced.push(report.id!);
        } else {
          const currentRetry = report.retryCount || 0;
          if (currentRetry < MAX_RETRIES) {
            await updateReportRetry(report.id!);
            failed.push(report.id!);
          } else {
            // Max retries reached — drop the report to prevent infinite loop
            console.warn(`Report ${report.id} exceeded max retries, removing from queue`);
            synced.push(report.id!);
          }
        }
      }

      // Remove synced reports
      for (const id of synced) {
        await removeReportFromQueue(id);
      }

      await loadPendingCount();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      syncingRef.current = false;
      syncInProgressRef.current = false;
      if (mountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, [isOnline, loadPendingCount]);

  // Queue a report for later submission
  const queueReport = useCallback(async (checkpointId: string, minutes: number, source: string): Promise<boolean> => {
    try {
      const result = await addReportToQueue({ checkpointId, minutes, source, reportedAt: new Date().toISOString() });

      // Register background sync when a report is queued (browser support required)
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          // SyncManager registration is not in standard lib.dom.d.ts yet
          const syncManager = registration as unknown as { sync?: { register: (tag: string) => Promise<void> } };
          await syncManager.sync?.register('sync-reports');
        } catch (syncError) {
          console.warn('Background sync registration failed:', syncError);
        }
      }

      await loadPendingCount();
      return result.success || result.deduped;
    } catch (error) {
      console.error('Failed to queue report:', error);
      return false;
    }
  }, [loadPendingCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    queueReport,
    syncQueue,
    refreshCount: loadPendingCount,
  };
}
