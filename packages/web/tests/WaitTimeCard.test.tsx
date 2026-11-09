import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WaitTimeCard } from "../src/components/WaitTimeCard";

describe("WaitTimeCard", () => {
  const defaultProps = {
    airportTerminal: "Main",
    waitTime: 15,
    status: "good" as const,
    trend: "stable" as const,
    lastUpdated: "2026-11-05T10:00:00Z",
  };

  it("renders terminal, wait time, status, and trend", () => {
    render(<WaitTimeCard {...defaultProps} />);
    expect(screen.getByText("Main")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("Good")).toBeTruthy();
    expect(screen.getByText("Stable")).toBeTruthy();
  });

  it("renders loading state when isLoading is true", () => {
    render(<WaitTimeCard {...defaultProps} isLoading />);
    expect(screen.queryByText("Main")).toBeNull();
    expect(screen.queryByText("15")).toBeNull();
  });

  it("applies status-based color classes", () => {
    render(<WaitTimeCard {...defaultProps} status="excellent" />);
    expect(screen.getByText("Excellent").className).toContain("text-green-600");

    render(<WaitTimeCard {...defaultProps} status="poor" />);
    expect(screen.getByText("Poor").className).toContain("text-red-600");
  });

  it("applies trend-based color classes", () => {
    render(<WaitTimeCard {...defaultProps} trend="improving" />);
    expect(screen.getByText("Improving").className).toContain("text-green-500");

    render(<WaitTimeCard {...defaultProps} trend="worsening" />);
    expect(screen.getByText("Worsening").className).toContain("text-red-500");
  });

  it("renders action buttons when callbacks provided", () => {
    render(
      <WaitTimeCard
        {...defaultProps}
        onReportTime={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Report time" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View details" })).toBeTruthy();
  });

  it("omits action buttons when no callbacks provided", () => {
    render(<WaitTimeCard {...defaultProps} />);
    expect(screen.queryByRole("button", { name: "Report time" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View details" })).toBeNull();
  });

  it("calls onReportTime when clicked", () => {
    const onReportTime = vi.fn();
    render(<WaitTimeCard {...defaultProps} onReportTime={onReportTime} />);
    fireEvent.click(screen.getByRole("button", { name: "Report time" }));
    expect(onReportTime).toHaveBeenCalledTimes(1);
  });
});
