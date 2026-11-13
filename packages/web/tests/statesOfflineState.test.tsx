import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { states } from "../src/components";

describe("states.OfflineState", () => {
  it("renders offline headline and Retry button", () => {
    const onRetry = vi.fn();
    render(<states.OfflineState onRetry={onRetry} queuedCount={0} />);
    expect(screen.getByText("You're offline.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry loading wait times/ })).toBeTruthy();
  });

  it("shows queued report counter when queuedCount > 0", () => {
    render(<states.OfflineState onRetry={vi.fn()} queuedCount={3} />);
    expect(screen.getByText(/3 reports queued for sync/)).toBeTruthy();
  });

  it("calls onRetry when clicked", () => {
    const onRetry = vi.fn();
    render(<states.OfflineState onRetry={onRetry} queuedCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Retry loading wait times/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
