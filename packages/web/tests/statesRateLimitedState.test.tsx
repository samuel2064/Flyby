import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { states } from "../src/components";

describe("states.RateLimitedState", () => {
  it("renders rate limit headline and countdown", () => {
    const onDismiss = vi.fn();
    render(<states.RateLimitedState minutesRemaining={4} onDismiss={onDismiss} />);
    expect(screen.getByText("Slow down — one report at a time.")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Rate limited. Wait 4 minutes before reporting again./ })).toBeTruthy();
  });

  it("uses singular minute when remaining is 1", () => {
    render(<states.RateLimitedState minutesRemaining={1} onDismiss={vi.fn()} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText(/minute/)).toBeTruthy();
  });

  it("calls onDismiss when OK clicked", () => {
    const onDismiss = vi.fn();
    render(<states.RateLimitedState minutesRemaining={4} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Rate limited. Wait 4 minutes before reporting again./ }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
