import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState } from "../src/components/ErrorState";

describe("ErrorState", () => {
  it("renders title and message", () => {
    render(<ErrorState title="Error" message="Something went wrong" />);
    expect(screen.getByText("Error")).toBeTruthy();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("renders retry action button", () => {
    const onRetry = vi.fn();
    render(
      <ErrorState title="Error" message="msg" retryAction={{ label: "Retry", onClick: onRetry }} />,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders secondary action button", () => {
    const onSecondary = vi.fn();
    render(
      <ErrorState title="Error" message="msg" secondaryAction={{ label: "Dismiss", onClick: onSecondary }} />,
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("shows error details when showDetails is true", () => {
    render(
      <ErrorState title="Error" message="msg" showDetails errorDetails="Stack trace here" />,
    );
    expect(screen.getByText("Stack trace here")).toBeTruthy();
  });

  it("hides error details when showDetails is false", () => {
    render(<ErrorState title="Error" message="msg" showDetails={false} errorDetails="trace" />);
    expect(screen.queryByText("trace")).toBeNull();
  });
});
