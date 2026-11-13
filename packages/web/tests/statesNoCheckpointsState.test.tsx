import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { states } from "../src/components";

describe("states.NoCheckpointsState", () => {
  it("renders headline, subhead, Search again, and Browse popular airports", () => {
    const onSearchAgain = vi.fn();
    const onBrowsePopular = vi.fn();
    render(<states.NoCheckpointsState onSearchAgain={onSearchAgain} onBrowsePopular={onBrowsePopular} />);
    expect(screen.getByText("No checkpoints found.")).toBeTruthy();
    expect(screen.getByText("Search again")).toBeTruthy();
    expect(screen.getByText("Browse popular airports")).toBeTruthy();
  });

  it("calls onSearchAgain and onBrowsePopular", () => {
    const onSearchAgain = vi.fn();
    const onBrowsePopular = vi.fn();
    render(<states.NoCheckpointsState onSearchAgain={onSearchAgain} onBrowsePopular={onBrowsePopular} />);
    fireEvent.click(screen.getByText("Search again"));
    expect(onSearchAgain).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Browse popular airports"));
    expect(onBrowsePopular).toHaveBeenCalledTimes(1);
  });
});
