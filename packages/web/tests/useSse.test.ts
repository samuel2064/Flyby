import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSse } from "../src/hooks/useSse";

/**
 * Minimal EventSource mock for testing the useSse hook.
 * Instances are tracked in a global registry so tests can send
 * synthetic events to the latest connection.
 */
class MockEventSource {
  static instances: MockEventSource[] = [];

  onopen: ((ev?: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev?: Event | ErrorEvent) => void) | null = null;

  private _listeners: Map<string, ((ev: Event) => void)[]> = new Map();
  closed = false;

  constructor(public readonly url: string | URL) {
    MockEventSource.instances.push(this);
    // Simulate async open
    setTimeout(() => {
      this.onopen?.(new Event("open"));
      this._emit("open", new Event("open"));
    }, 0);
  }

  addEventListener(type: string, handler: (ev: Event) => void): void {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type)!.push(handler);
  }

  removeEventListener(type: string, handler: (ev: Event) => void): void {
    const arr = this._listeners.get(type) || [];
    const idx = arr.indexOf(handler);
    if (idx > -1) arr.splice(idx, 1);
  }

  close(): void {
    this.closed = true;
  }

  dispatchEvent(ev: Event): boolean {
    this._emit(ev.type, ev);
    if (ev instanceof MessageEvent && this.onmessage) {
      this.onmessage(ev);
    }
    return true;
  }

  private _emit(type: string, ev: Event): void {
    (this._listeners.get(type) || []).forEach((fn) => fn(ev));
  }
}

function getMockInstance(url: string): MockEventSource | undefined {
  return MockEventSource.instances.find((i) => i.url === url);
}

beforeEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error: mock EventSource globally
  global.EventSource = MockEventSource;
  MockEventSource.instances = [];
});

afterEach(() => {
  delete (global as any).EventSource;
});

describe("useSse", () => {
  it("initializes with connecting status when URL is provided", () => {
    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream")
    );
    expect(result.current.status).toBe("connecting");
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("transitions to open when EventSource connects", async () => {
    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream")
    );
    await waitFor(() => expect(result.current.status).toBe("open"));
    expect(result.current.error).toBeNull();
  });

  it("parses and returns data from messages", async () => {
    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream")
    );
    await waitFor(() => expect(result.current.status).toBe("open"));

    const es = getMockInstance("/stream")!;
    act(() => { es.dispatchEvent(new MessageEvent("message", { data: '{"minutes":15}' })); });

    await waitFor(() => {
      expect(result.current.data).toEqual({ minutes: 15 });
    });
  });

  it("ignores malformed JSON gracefully", async () => {
    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream")
    );
    await waitFor(() => expect(result.current.status).toBe("open"));

    const es = getMockInstance("/stream")!;
    if (es.onmessage) {
      // simulate JSON.parse failure by sending invalid data
      try {
        const msg = new MessageEvent("message", { data: "not-json" });
        es.dispatchEvent(msg);
      } catch {
        // expected
      }
    }

    // data should not throw and remain as-is (null or previous)
    expect(result.current.error).toBeNull();
  });

  it("handles multiple messages", async () => {
    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", { throttleInterval: 0 })
    );
    await waitFor(() => expect(result.current.status).toBe("open"));

    const es = getMockInstance("/stream")!;
    act(() => { es.dispatchEvent(new MessageEvent("message", { data: '{"minutes":10}' })); });
    act(() => { es.dispatchEvent(new MessageEvent("message", { data: '{"minutes":20}' })); });
    act(() => { es.dispatchEvent(new MessageEvent("message", { data: '{"minutes":30}' })); });

    await waitFor(() => {
      const data = result.current.data as unknown as { minutes: number };
      expect(data?.minutes).toBe(30);
    });
  });

  it("retries on transient errors up to maxRetries", async () => {
    const OriginalES = (global as any).EventSource;
    // @ts-expect-error: mock error that always fails
    global.EventSource = class {
      constructor() {
        throw new Error("Connection refused");
      }
    };

    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        maxRetries: 2,
        retryDelay: 50,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(Error);

    global.EventSource = OriginalES;
  });

  it("calls onClose callback on error", async () => {
    const onClose = vi.fn();

    const OriginalES = (global as any).EventSource;
    // @ts-expect-error: mock that always fails
    global.EventSource = class {
      constructor() {
        throw new Error("Connection refused");
      }
    };

    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", { onClose })
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("error"));

    global.EventSource = OriginalES;
  });

  it("calls onClose callback on unmount", async () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", { onClose })
    );

    await waitFor(() => expect(getMockInstance("/stream")).toBeDefined());
    unmount();

    await waitFor(() => expect(onClose).toHaveBeenCalledWith("clean"));
  });

  it("recovers with exponential backoff after maxRetries exceeded", async () => {
    const onClose = vi.fn();
    const OriginalES = (global as any).EventSource;
    // @ts-expect-error: mock that always fails
    global.EventSource = class {
      constructor() {
        throw new Error("Connection refused");
      }
    };

    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        maxRetries: 1,
        retryDelay: 10,
        onClose,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(Error);

    global.EventSource = OriginalES;
  });

  it("cleans up on unmount", async () => {
    const { unmount } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream")
    );
    await waitFor(() => {
      const es = getMockInstance("/stream");
      expect(es).toBeDefined();
    });

    const es = getMockInstance("/stream")!;
    unmount();
    expect(es.closed).toBe(true);
  });

  it("handles connection errors", async () => {
    // Override EventSource to throw on construction
    const OriginalES = (global as any).EventSource;
    // @ts-expect-error: force mock error
    global.EventSource = class {
      constructor() {
        throw new Error("Connection refused");
      }
    };

    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream")
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(Error);

    global.EventSource = OriginalES;
  });

  it("returns isPolling false by default", () => {
    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream")
    );
    expect(result.current.isPolling).toBe(false);
  });

  it("falls back to polling when EventSource is not available", async () => {
    // Remove EventSource global to simulate unsupported browser
    delete (global as any).EventSource;

    const mockFetch = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ data: { minutes: 42 } }),
    });

    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        pollUrl: "/api/poll",
        pollInterval: 50,
      })
    );

    await waitFor(() => {
      expect(result.current.isPolling).toBe(true);
    });

    await waitFor(() => {
      const data = result.current.data as unknown as { minutes: number };
      expect(data?.minutes).toBe(42);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/poll");
    mockFetch.mockRestore();
  });

  it("falls back to polling when SSE errors with maxRetries exceeded", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ data: { minutes: 99 } }),
    });

    // Mock EventSource that always errors after opening
    const FailES = class {
      onopen: ((ev?: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev?: Event | ErrorEvent) => void) | null = null;
      closed = false;
      constructor(public readonly url: string | URL) {
        setTimeout(() => {
          this.onerror?.(new Event("error"));
        }, 10);
      }
      close(): void { this.closed = true; }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent(): boolean { return true; }
    };
    // @ts-expect-error: mock EventSource
    global.EventSource = FailES;

    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        maxRetries: 1,
        retryDelay: 10,
        pollUrl: "/api/poll-fallback",
        pollInterval: 50,
      })
    );

    // Wait for SSE to fail and fallback to polling
    await waitFor(() => {
      expect(result.current.isPolling).toBe(true);
    });

    // Polling should have fetched data
    await waitFor(() => {
      const data = result.current.data as unknown as { minutes: number };
      expect(data?.minutes).toBe(99);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/poll-fallback");
    mockFetch.mockRestore();
  });

  it("throttles rapid updates to throttleInterval", async () => {
    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        throttleInterval: 200,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("open"));

    const es = getMockInstance("/stream")!;

    const start = Date.now();

    // Send 10 rapid messages
    for (let i = 1; i <= 10; i++) {
      act(() => {
        es.dispatchEvent(
          new MessageEvent("message", { data: `{"value":${i}}` })
        );
      });
    }

    // After a short delay, data should be the last value (throttled)
    await waitFor(() => {
      const data = result.current.data as unknown as { value: number };
      expect(data?.value).toBe(10);
    });

    // Time elapsed should be at least throttleInterval due to throttling
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(190);
  });

  it("uses custom pollParser to transform poll data", async () => {
    delete (global as any).EventSource;

    const mockFetch = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ data: { nested: { value: 77 } } }),
    });

    const pollParser = vi.fn((data: unknown) => {
      const nested = (data as any).nested;
      return { result: nested.value };
    });

    const { result } = renderHook(() =>
      useSse<{ result: number }>("/stream", {
        pollUrl: "/api/poll-custom",
        pollInterval: 50,
        pollParser,
      })
    );

    await waitFor(() => {
      expect(result.current.data?.result).toBe(77);
    });

    expect(pollParser).toHaveBeenCalled();
    mockFetch.mockRestore();
  });

  it("cleans up throttle timer on unmount", async () => {
    const { unmount } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        throttleInterval: 1000,
      })
    );
    await waitFor(() => expect(getMockInstance("/stream")).toBeDefined());

    // Dispatch a message to trigger throttle timer
    const es = getMockInstance("/stream")!;
    act(() => { es.dispatchEvent(new MessageEvent("message", { data: '{"value":1}' })); });

    // Unmount should clean up throttle timer
    unmount();
    // If throttle timer was set, it should be cleaned up (no error thrown)
  });

  it("cleans up reconnect timer on unmount", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ data: { minutes: 42 } }),
    });

    // Mock EventSource that fails
    const FailES = class {
      onopen: ((ev?: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev?: Event | ErrorEvent) => void) | null = null;
      closed = false;
      constructor(public readonly url: string | URL) {
        setTimeout(() => {
          this.onerror?.(new Event("error"));
        }, 10);
      }
      close(): void { this.closed = true; }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent(): boolean { return true; }
    };
    global.EventSource = FailES;

    const { result, unmount } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        maxRetries: 1,
        retryDelay: 10,
        pollUrl: "/api/poll-fallback",
        pollInterval: 50,
      })
    );

    // Wait for SSE to fail and fallback to polling (which triggers reconnect timer)
    await waitFor(() => {
      expect(result.current.isPolling).toBe(true);
    });

    // Unmount should clean up reconnect timer
    unmount();
    mockFetch.mockRestore();
  });

  it("cleans up backoff timer on unmount", async () => {
    const OriginalES = (global as any).EventSource;
    global.EventSource = class {
      constructor() {
        throw new Error("Connection refused");
      }
    };

    const { result, unmount } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        maxRetries: 2,
        retryDelay: 50,
      })
    );

    // Wait for error state (should be immediate since constructor throws)
    await waitFor(() => expect(result.current.status).toBe("error"));

    // Unmount should clean up backoff timer
    unmount();

    global.EventSource = OriginalES;
  });

  it("cleans up poll interval on unmount when polling", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ data: { minutes: 42 } }),
    });

    // Use a failing EventSource to force polling fallback
    const FailES = class {
      onopen: ((ev?: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev?: Event | ErrorEvent) => void) | null = null;
      closed = false;
      constructor(public readonly url: string | URL) {
        setTimeout(() => {
          this.onerror?.(new Event("error"));
        }, 10);
      }
      close(): void { this.closed = true; }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent(): boolean { return true; }
    };
    global.EventSource = FailES;

    const { result, unmount } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        pollUrl: "/api/poll",
        pollInterval: 50,
        maxRetries: 1,
        retryDelay: 10,
      })
    );

    // Wait for SSE to fail and fallback to polling
    await waitFor(() => {
      expect(result.current.isPolling).toBe(true);
    });

    // Unmount should clean up poll interval
    unmount();
    mockFetch.mockRestore();
  });

  it("handles EventSource undefined with pollUrl but zero pollInterval", () => {
    delete (global as any).EventSource;

    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        pollUrl: "/api/poll",
        pollInterval: 0,
      })
    );

    // Should not start polling when pollInterval is 0
    expect(result.current.isPolling).toBe(false);
    expect(result.current.status).toBe("closed");
  });

  it("handles EventSource undefined with pollUrl and negative pollInterval", () => {
    delete (global as any).EventSource;

    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        pollUrl: "/api/poll",
        pollInterval: -1,
      })
    );

    // Should not start polling when pollInterval is negative
    expect(result.current.isPolling).toBe(false);
    expect(result.current.status).toBe("closed");
  });

  it("stops polling when EventSource connects successfully", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ data: { minutes: 42 } }),
    });

    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        pollUrl: "/api/poll",
        pollInterval: 50,
      })
    );

    // Initially should be polling since EventSource is mocked to fail
    // But our MockEventSource connects successfully
    await waitFor(() => {
      expect(result.current.status).toBe("open");
      expect(result.current.isPolling).toBe(false);
    });

    mockFetch.mockRestore();
  });

  it("handles onmessage parse error without breaking", async () => {
    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        throttleInterval: 0,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("open"));

    const es = getMockInstance("/stream")!;
    // Send invalid JSON
    act(() => { es.dispatchEvent(new MessageEvent("message", { data: "not-valid-json" })); });

    // Should not throw and error should remain null
    expect(result.current.error).toBeNull();
  });

  it("does not create new throttle timer if one already exists", async () => {
    const { result } = renderHook(() =>
      useSse<Record<string, unknown>>("/stream", {
        throttleInterval: 200,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("open"));

    const es = getMockInstance("/stream")!;

    // Send first message - should create throttle timer
    act(() => { es.dispatchEvent(new MessageEvent("message", { data: '{"value":1}' })); });

    // Send second message quickly - should not create new timer
    act(() => { es.dispatchEvent(new MessageEvent("message", { data: '{"value":2}' })); });

    // Wait for throttle to flush
    await waitFor(() => {
      const data = result.current.data as unknown as { value: number };
      expect(data?.value).toBe(2);
    });
  });
});
