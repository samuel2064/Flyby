import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingState } from "../src/components/LoadingState";

describe("LoadingState", () => {
  it("renders skeleton by default", () => {
    render(<LoadingState />);
    const el = screen.getByLabelText("Loading");
    expect(el).toBeTruthy();
    expect(el.className).toContain("animate-pulse");
  });

  it("renders spinner type", () => {
    render(<LoadingState type="spinner" />);
    const svg = document.querySelector("svg.animate-spin");
    expect(svg).toBeTruthy();
  });

  it("renders banner type with title and message", () => {
    render(
      <LoadingState type="banner" title="Loading data" message="Please wait" />,
    );
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Loading data")).toBeTruthy();
    expect(screen.getByText("Please wait")).toBeTruthy();
  });

  it("uses custom label for skeleton aria-label", () => {
    render(<LoadingState type="skeleton" label="Fetching checkpoints" />);
    expect(screen.getByLabelText("Fetching checkpoints")).toBeTruthy();
  });
});
