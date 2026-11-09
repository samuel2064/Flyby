import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "../src/components/EmptyState";

describe("EmptyState", () => {
  it("renders title and message", () => {
    render(<EmptyState _type="no-data" title="No data" message="Nothing to see here" />);
    expect(screen.getByText("No data")).toBeTruthy();
    expect(screen.getByText("Nothing to see here")).toBeTruthy();
  });

  it("renders primary action button", () => {
    const onPrimary = vi.fn();
    render(
      <EmptyState _type="no-data" title="Empty" message="msg" primaryAction={{ label: "Add", onClick: onPrimary }} />,
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("renders secondary action button", () => {
    const onSecondary = vi.fn();
    render(
      <EmptyState _type="no-data" title="Empty" message="msg" secondaryAction={{ label: "Skip", onClick: onSecondary }} />,
    );
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("renders illustration by default", () => {
    render(<EmptyState _type="no-data" title="Empty" message="msg" illustration="no-data" />);
    const svg = document.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("hides illustration when showIllustration is false", () => {
    render(
      <EmptyState _type="no-data" title="Empty" message="msg" illustration="no-data" showIllustration={false} />,
    );
    expect(document.querySelector("svg")).toBeNull();
  });
});
