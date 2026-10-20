import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "../src/hooks/useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 500));
    expect(result.current).toBe("initial");
  });

  it("delays updating the value", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useDebounce(value, delay),
      { initialProps: { value: "a", delay: 500 } }
    );

    expect(result.current).toBe("a");

    rerender({ value: "b", delay: 500 });
    expect(result.current).toBe("a"); // still debounced

    act(() => { vi.advanceTimersByTime(499); });
    expect(result.current).toBe("a"); // still debounced

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe("b"); // now updated
  });

  it("resets timer on rapid changes", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useDebounce(value, delay),
      { initialProps: { value: "a", delay: 500 } }
    );

    rerender({ value: "b", delay: 500 });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: "c", delay: 500 });
    act(() => { vi.advanceTimersByTime(499); });
    expect(result.current).toBe("a"); // still "a", b's timer was reset

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe("c"); // now updated to c
  });

  it("works with numbers", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: number; delay: number }) =>
        useDebounce(value, delay),
      { initialProps: { value: 0, delay: 100 } }
    );

    rerender({ value: 42, delay: 100 });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe(42);
  });

  it("handles zero delay", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useDebounce(value, delay),
      { initialProps: { value: "x", delay: 0 } }
    );

    rerender({ value: "y", delay: 0 });
    // Even with 0ms delay, setTimeout still queues a microtask
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current).toBe("y");
  });
});
