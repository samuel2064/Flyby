import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "../src/components/ErrorBoundary";

const ThrowError = () => {
  throw new Error("Test crash");
};

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeDefined();
  });

  it("catches errors and shows fallback", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.getByText("Test crash")).toBeDefined();
    expect(screen.getByText("Go to Home")).toBeDefined();
  });
});
