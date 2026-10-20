import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRefreshInterval } from "../src/hooks/useRefreshInterval";

describe("useRefreshInterval", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Ensure document.hidden starts as false
    Object.defineProperty(document, "hidden", {
      writable: true,
      configurable: true,
      value: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the callback at the specified interval", async () => {
    const callback = vi.fn();
    renderHook(() => useRefreshInterval(callback, 5_000));

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    vi.advanceTimersByTime(5_000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
  });

  it("does not call callback when the page is hidden", async () => {
    const callback = vi.fn();
    renderHook(() => useRefreshInterval(callback, 5_000));

    // Advance to first tick
    vi.advanceTimersByTime(5_000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    // Mock document.hidden to true (page hidden)
    Object.defineProperty(document, "hidden", {
      writable: true,
      configurable: true,
      value: true,
    });

    vi.advanceTimersByTime(5_000);
    // Page is hidden, so callback should NOT be called again
    expect(callback).toHaveBeenCalledTimes(1);

    // Restore visibility
    Object.defineProperty(document, "hidden", {
      writable: true,
      configurable: true,
      value: false,
    });

    // Next tick after visibility restores should fire
    vi.advanceTimersByTime(5_000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
  });

  it("triggers immediate tick when visibility changes from hidden to visible", async () => {
    const callback = vi.fn();
    renderHook(() => useRefreshInterval(callback, 5_000));

    // Advance to first tick
    vi.advanceTimersByTime(5_000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    // Mock document.hidden to true (page hidden)
    Object.defineProperty(document, "hidden", {
      writable: true,
      configurable: true,
      value: true,
    });

    // Advance time but callback should not be called
    vi.advanceTimersByTime(5_000);
    expect(callback).toHaveBeenCalledTimes(1);

    // Dispatch visibilitychange event while hidden - should not trigger callback
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Advance time - still hidden, no callback
    vi.advanceTimersByTime(5_000);
    expect(callback).toHaveBeenCalledTimes(1);

    // Now restore visibility
    Object.defineProperty(document, "hidden", {
      writable: true,
      configurable: true,
      value: false,
    });

    // Dispatch visibilitychange - this should clear and reset the timer
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Timer should be reset, so next tick should be at the next interval
    vi.advanceTimersByTime(5_000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
  });

  it("respects custom delay intervals", async () => {
    const callback = vi.fn();
    renderHook(() => useRefreshInterval(callback, 10_000));

    vi.advanceTimersByTime(10_000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    vi.advanceTimersByTime(10_000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
  });

  it("cleans up the interval on unmount", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useRefreshInterval(callback, 5_000));

    unmount();
    vi.advanceTimersByTime(10_000);

    expect(callback).not.toHaveBeenCalled();
  });

  it("uses the latest callback via ref", async () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) => useRefreshInterval(cb, 5_000),
      { initialProps: { cb: callback1 } }
    );

    vi.advanceTimersByTime(5_000);
    await waitFor(() => expect(callback1).toHaveBeenCalledTimes(1));

    // Change the callback
    rerender({ cb: callback2 });

    vi.advanceTimersByTime(5_000);
    await waitFor(() => expect(callback2).toHaveBeenCalledTimes(1));
    expect(callback1).toHaveBeenCalledTimes(1); // should not grow
  });
});