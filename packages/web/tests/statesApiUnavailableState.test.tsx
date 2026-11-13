import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { states } from "../src/components";

describe("states.ApiUnavailableState", () => {
  it("renders service down headline and Retry button", () => {
    const onRetry = vi.fn();
    render(<states.ApiUnavailableState onRetry={onRetry} />);
    expect(screen.getByText("Wait times temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry loading wait times/ })).toBeTruthy();
  });

  it("calls onRetry when clicked", () => {
    const onRetry = vi.fn();
    render(<states.ApiUnavailableState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /Retry loading wait times/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
