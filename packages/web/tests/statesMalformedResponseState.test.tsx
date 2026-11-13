import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { states } from "../src/components";

describe("states.MalformedResponseState", () => {
  it("renders data error headline, Retry, and Report issue", () => {
    const onRetry = vi.fn();
    const onReportIssue = vi.fn();
    render(<states.MalformedResponseState onRetry={onRetry} onReportIssue={onReportIssue} />);
    expect(screen.getByText("We're having trouble reading the data.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry loading wait times/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Report issue/ })).toBeTruthy();
  });

  it("calls onRetry and onReportIssue", () => {
    const onRetry = vi.fn();
    const onReportIssue = vi.fn();
    render(<states.MalformedResponseState onRetry={onRetry} onReportIssue={onReportIssue} />);
    fireEvent.click(screen.getByRole("button", { name: /Retry loading wait times/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Report issue/ }));
    expect(onReportIssue).toHaveBeenCalledTimes(1);
  });
});
