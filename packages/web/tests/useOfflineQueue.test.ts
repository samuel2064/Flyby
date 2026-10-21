import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useOfflineQueue } from "../src/hooks/useOfflineQueue";
import * as offlineQueueLib from "../src/lib/offlineQueue";

vi.mock("../src/lib/offlineQueue");

describe("useOfflineQueue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
    });

    // Mock window event listeners
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with online status and zero pending count", () => {
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(0);

    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current.isOnline).toBe(true);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.isSyncing).toBe(false);
  });

  it("sets up online/offline event listeners on mount", () => {
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(0);

    renderHook(() => useOfflineQueue());

    expect(window.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it("cleans up event listeners on unmount", () => {
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(0);

    const { unmount } = renderHook(() => useOfflineQueue());

    unmount();

    expect(window.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(window.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it("loads pending count on mount", async () => {
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(5);

    const { result } = renderHook(() => useOfflineQueue());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(5);
    });

    expect(offlineQueueLib.getQueueCount).toHaveBeenCalled();
  });

  it("updates isOnline when coming back online", async () => {
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(0);

    const { result } = renderHook(() => useOfflineQueue());

    // Initial state is online (navigator.onLine = true)
    expect(result.current.isOnline).toBe(true);

    // Simulate coming back online (handler sets isOnline to true)
    const onlineHandler = (window.addEventListener as any).mock.calls.find(
      (call: any[]) => call[0] === 'online'
    )[1];
    
    act(() => { onlineHandler(); });

    await waitFor(() => {
      expect(result.current.isOnline).toBe(true);
    });
  });

  it("updates isOnline when going offline", async () => {
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(0);

    const { result } = renderHook(() => useOfflineQueue());

    // Initial state is online
    expect(result.current.isOnline).toBe(true);

    // Simulate going offline (handler sets isOnline to false)
    const offlineHandler = (window.addEventListener as any).mock.calls.find(
      (call: any[]) => call[0] === 'offline'
    )[1];
    
    act(() => { offlineHandler(); });

    await waitFor(() => {
      expect(result.current.isOnline).toBe(false);
    });
  });

  it("queueReport calls addReportToQueue and refreshes count", async () => {
    vi.mocked(offlineQueueLib.addReportToQueue).mockResolvedValue({ success: true, deduped: false });
    vi.mocked(offlineQueueLib.getQueueCount)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    const { result } = renderHook(() => useOfflineQueue());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });

    let success = false;
    await act(async () => {
      success = await result.current.queueReport("cp-1", 25, "crowd");
    });

    expect(success).toBe(true);
    expect(offlineQueueLib.addReportToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpointId: "cp-1",
        minutes: 25,
        source: "crowd",
        reportedAt: expect.any(String),
      })
    );

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });
  });

  it("syncQueue does nothing when offline", async () => {
    navigator.onLine = false;
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(0);
    vi.mocked(offlineQueueLib.getPendingReports).mockResolvedValue([]);

    const { result } = renderHook(() => useOfflineQueue());

    const submitReport = vi.fn().mockResolvedValue(true);
    await act(() => result.current.syncQueue(submitReport));

    expect(offlineQueueLib.getPendingReports).not.toHaveBeenCalled();
    expect(submitReport).not.toHaveBeenCalled();
  });

  it("syncQueue processes pending reports when online", async () => {
    navigator.onLine = true;
    const mockReports = [
      { id: 1, checkpointId: "cp-1", minutes: 25, source: "crowd", timestamp: Date.now(), retryCount: 0 },
      { id: 2, checkpointId: "cp-2", minutes: 30, source: "crowd", timestamp: Date.now(), retryCount: 0 },
    ];

    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(2);
    vi.mocked(offlineQueueLib.getPendingReports).mockResolvedValue(mockReports);
    vi.mocked(offlineQueueLib.removeReportFromQueue).mockResolvedValue();

    const { result } = renderHook(() => useOfflineQueue());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(2);
    });

    const submitReport = vi.fn().mockResolvedValue(true);
    await act(() => result.current.syncQueue(submitReport));

    expect(offlineQueueLib.getPendingReports).toHaveBeenCalled();
    expect(submitReport).toHaveBeenCalledTimes(2);
    expect(offlineQueueLib.removeReportFromQueue).toHaveBeenCalledTimes(2);
  });

  it("syncQueue handles failed submissions with retry logic", async () => {
    navigator.onLine = true;
    const mockReports = [
      { id: 1, checkpointId: "cp-1", minutes: 25, source: "crowd", timestamp: Date.now(), retryCount: 0 },
    ];

    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(1);
    vi.mocked(offlineQueueLib.getPendingReports).mockResolvedValue(mockReports);
    vi.mocked(offlineQueueLib.updateReportRetry).mockResolvedValue();

    const { result } = renderHook(() => useOfflineQueue());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });

    const submitReport = vi.fn().mockResolvedValue(false);
    await act(() => result.current.syncQueue(submitReport));

    expect(submitReport).toHaveBeenCalled();
    expect(offlineQueueLib.updateReportRetry).toHaveBeenCalledWith(1);
  });

  it("refreshCount reloads the pending count", async () => {
    vi.mocked(offlineQueueLib.getQueueCount)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5);

    const { result } = renderHook(() => useOfflineQueue());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });

    await act(() => result.current.refreshCount());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(5);
    });
  });
});
describe("useOfflineQueue - background sync registration + failure arms", () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(Navigator.prototype, "serviceWorker")
    ? undefined
    : undefined;

  function stubServiceWorker(ready: Promise<unknown>): void {
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready },
      configurable: true,
      writable: true,
    });
    (window as unknown as Record<string, unknown>).SyncManager = {};
  }

  afterEach(() => {
    // @ts-expect-error test-only delete of the stubbed property
    delete navigator.serviceWorker;
    delete (window as unknown as Record<string, unknown>).SyncManager;
    vi.restoreAllMocks();
  });

  it("registers background sync when a report is queued and the browser supports it", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    stubServiceWorker(Promise.resolve({ sync: { register } }));
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(1);
    vi.mocked(offlineQueueLib.addReportToQueue).mockResolvedValue({ success: true, deduped: false });

    const { result } = renderHook(() => useOfflineQueue());
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    let queued = false;
    await act(async () => {
      queued = await result.current.queueReport("ck-1", 12, "crowd");
    });

    expect(queued).toBe(true);
    expect(register).toHaveBeenCalledWith("sync-reports");
    expect(offlineQueueLib.addReportToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointId: "ck-1", minutes: 12, source: "crowd" }),
    );
  });

  it("queues successfully even when background sync registration fails", async () => {
    stubServiceWorker(Promise.reject(new Error("service worker unavailable")));
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(0);
    vi.mocked(offlineQueueLib.addReportToQueue).mockResolvedValue({ success: true, deduped: false });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useOfflineQueue());

    let queued = false;
    await act(async () => {
      queued = await result.current.queueReport("ck-2", 25, "crowd");
    });

    expect(queued).toBe(true); // the report is queued; sync registration is best-effort
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns false when queueing itself fails", async () => {
    vi.mocked(offlineQueueLib.addReportToQueue).mockRejectedValue(new Error("storage full"));
    vi.mocked(offlineQueueLib.getQueueCount).mockResolvedValue(0);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useOfflineQueue());

    let queued = true;
    await act(async () => {
      queued = await result.current.queueReport("ck-3", 30, "crowd");
    });

    expect(queued).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
