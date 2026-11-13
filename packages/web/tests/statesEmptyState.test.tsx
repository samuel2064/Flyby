import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { states } from "../src/components";

describe("states.EmptyState", () => {
  it("renders headline, subhead, illustration, and primary action", () => {
    const onPrimary = vi.fn();
    render(
      <states.EmptyState
        illustration="no-data"
        headline="No wait times reported yet."
        subhead="Be the first to report."
        primaryAction={{ label: "Report Wait Time", onClick: onPrimary }}
        onPrimary={onPrimary}
      />,
    );
    expect(screen.getByText("No wait times reported yet.")).toBeTruthy();
    expect(screen.getByText("Be the first to report.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report Wait Time" })).toBeTruthy();
    const svg = document.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("calls onPrimary when primary action clicked", () => {
    const onPrimary = vi.fn();
    render(
      <states.EmptyState
        illustration="no-data"
        headline="No data"
        subhead="msg"
        primaryAction={{ label: "Report", onClick: onPrimary }}
        onPrimary={onPrimary}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("renders secondary action when provided", () => {
    const onSecondary = vi.fn();
    render(
      <states.EmptyState
        illustration="no-data"
        headline="No data"
        subhead="msg"
        primaryAction={{ label: "Primary", onClick: vi.fn() }}
        secondaryAction={{ label: "Secondary", onClick: onSecondary }}
        onPrimary={vi.fn()}
        onSecondary={onSecondary}
      />,
    );
    expect(screen.getByRole("button", { name: "Secondary" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Secondary" }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
