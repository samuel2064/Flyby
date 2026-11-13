import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { states } from "../src/components";

describe("states.NetworkErrorState", () => {
  it("renders error headline, Retry, and Report anyway", () => {
    const onRetry = vi.fn();
    const onReportAnyway = vi.fn();
    render(<states.NetworkErrorState onRetry={onRetry} onReportAnyway={onReportAnyway} />);
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry loading wait times/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Report anyway/ })).toBeTruthy();
  });

  it("calls onRetry and onReportAnyway", () => {
    const onRetry = vi.fn();
    const onReportAnyway = vi.fn();
    render(<states.NetworkErrorState onRetry={onRetry} onReportAnyway={onReportAnyway} />);
    fireEvent.click(screen.getByRole("button", { name: /Retry loading wait times/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Report anyway/ }));
    expect(onReportAnyway).toHaveBeenCalledTimes(1);
  });
});
