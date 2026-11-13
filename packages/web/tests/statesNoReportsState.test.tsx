import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { states } from "../src/components";

describe("states.NoReportsState", () => {
  it("renders headline, subhead, and Report Wait Time button", () => {
    const onReport = vi.fn();
    render(<states.NoReportsState onReport={onReport} />);
    expect(screen.getByText("No wait times reported yet.")).toBeTruthy();
    expect(screen.getByText("Be the first to report how long the line is at this checkpoint.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Report Wait Time/ })).toBeTruthy();
  });

  it("calls onReport when clicked", () => {
    const onReport = vi.fn();
    render(<states.NoReportsState onReport={onReport} />);
    fireEvent.click(screen.getByRole("button", { name: /Report Wait Time/ }));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it("renders Check another airport secondary action", () => {
    render(<states.NoReportsState onReport={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Check another airport/ })).toBeTruthy();
  });
});
