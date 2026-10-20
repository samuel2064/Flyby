// Offline queue for wait time reports using IndexedDB
// Stores reports when offline and syncs when connection is restored
// Features: idempotency, retry backoff, queue size limiting, IndexedDB persistence

const DB_NAME = 'flyby-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'pending-reports';
export const MAX_QUEUE_SIZE = 50; // Prevent unbounded queue growth
export const MAX_RETRIES = 3;

interface PendingReport {
  id?: number;
  checkpointId: string;
  minutes: number;
  source: string;
  timestamp: number;
  reportedAt: string;
  retryCount?: number;
}

let db: IDBDatabase | null = null;

// Check if IndexedDB is available (not available in SSR/test environments)
function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

// In-memory fallback for test environments
let inMemoryStore: PendingReport[] = [];
let nextId = 1;

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  if (!isIndexedDBAvailable()) {
    // Return a mock database object for test environments
    return {} as IDBDatabase;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        // Create index for checkpointId to support deduplication queries
        store.createIndex('checkpointId', 'checkpointId', { unique: false });
      }
    };
  });
}

/**
 * Generate a unique key for deduplication.
 * Reports for the same checkpoint within a 5-minute window are considered duplicates.
 */
function getReportDeduplicationKey(checkpointId: string, timestamp: number): string {
  const windowMinutes = 5;
  const windowTimestamp = Math.floor(timestamp / (windowMinutes * 60 * 1000));
  return `${checkpointId}:${windowTimestamp}`;
}

async function isDuplicate(report: Omit<PendingReport, 'id'>): Promise<boolean> {
  const existing = await getPendingReports();
  const newKey = getReportDeduplicationKey(report.checkpointId, report.timestamp);

  return existing.some(r => {
    if (r.checkpointId !== report.checkpointId) return false;
    const existingKey = getReportDeduplicationKey(r.checkpointId, r.timestamp);
    return existingKey === newKey;
  });
}

export async function addReportToQueue(report: Omit<PendingReport, 'id' | 'timestamp' | 'retryCount'>): Promise<{ success: boolean; deduped: boolean }> {
  const now = Date.now();
  const pendingReport: PendingReport = {
    ...report,
    timestamp: now,
    reportedAt: report.reportedAt || new Date(now).toISOString(),
    retryCount: 0,
  };

  if (!isIndexedDBAvailable()) {
    // In-memory fallback for tests
    const dup = await isDuplicate(pendingReport);
    if (dup) return { success: true, deduped: true };

    // Check queue size limit
    if (inMemoryStore.length >= MAX_QUEUE_SIZE) {
      return { success: false, deduped: false };
    }

    inMemoryStore.push({ ...pendingReport, id: nextId++ });
    return { success: true, deduped: false };
  }

  const database = await openDB();

  // Check for duplicate before adding
  const dup = await isDuplicate(pendingReport);
  if (dup) return { success: true, deduped: true };

  // Check queue size limit
  const count = await getQueueCount();
  if (count >= MAX_QUEUE_SIZE) {
    return { success: false, deduped: false };
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(pendingReport);
    request.onsuccess = () => resolve({ success: true, deduped: false });
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingReports(): Promise<PendingReport[]> {
  if (!isIndexedDBAvailable()) {
    return Promise.resolve(inMemoryStore);
  }

  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeReportFromQueue(id: number): Promise<void> {
  if (!isIndexedDBAvailable()) {
    inMemoryStore = inMemoryStore.filter(r => r.id !== id);
    return Promise.resolve();
  }

  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateReportRetry(id: number): Promise<void> {
  if (!isIndexedDBAvailable()) {
    const report = inMemoryStore.find(r => r.id === id);
    if (report) {
      report.retryCount = (report.retryCount || 0) + 1;
    }
    return Promise.resolve();
  }

  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const report = getReq.result;
      if (report) {
        report.retryCount = (report.retryCount || 0) + 1;
        const putReq = store.put(report);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function clearQueue(): Promise<void> {
  if (!isIndexedDBAvailable()) {
    inMemoryStore = [];
    nextId = 1;
    return Promise.resolve();
  }

  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getQueueCount(): Promise<number> {
  if (!isIndexedDBAvailable()) {
    return Promise.resolve(inMemoryStore.length);
  }

  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getMaxRetries(): Promise<number> {
  return MAX_RETRIES;
}

export async function getMaxQueueSize(): Promise<number> {
  return MAX_QUEUE_SIZE;
}
