import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FeatureCard } from "../src/components/FeatureCard";

const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} data-testid="star-icon" />
);

describe("FeatureCard", () => {
  it("renders title, description, and primary action", () => {
    render(
      <FeatureCard
        icon={StarIcon}
        title="Fast check-ins"
        description="Skip the line with priority access."
        primaryAction={{ label: "Get Started", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByText("Fast check-ins")).toBeTruthy();
    expect(screen.getByText("Skip the line with priority access.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Get Started" })).toBeTruthy();
  });

  it("renders secondary action when provided", () => {
    render(
      <FeatureCard
        icon={StarIcon}
        title="Feature"
        description="A feature description."
        primaryAction={{ label: "Go", onClick: vi.fn() }}
        secondaryAction={{ label: "Learn more", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole("button", { name: "Learn more" })).toBeTruthy();
  });

  it("applies opacity when isLoading", () => {
    render(
      <FeatureCard
        icon={StarIcon}
        title="Loading"
        description="desc"
        primaryAction={{ label: "Go", onClick: vi.fn() }}
        isLoading
      />,
    );
    const card = screen.getByText("Loading").closest("article");
    expect(card?.className).toContain("opacity-70");
    expect(card?.className).toContain("pointer-events-none");
  });

  it("applies opacity when disabled", () => {
    render(
      <FeatureCard
        icon={StarIcon}
        title="Disabled"
        description="desc"
        primaryAction={{ label: "Go", onClick: vi.fn() }}
        disabled
      />,
    );
    const card = screen.getByText("Disabled").closest("article");
    expect(card?.className).toContain("opacity-50");
    expect(card?.className).toContain("cursor-not-allowed");
  });

  it("disables buttons when isLoading", () => {
    render(
      <FeatureCard
        icon={StarIcon}
        title="Disabled"
        description="desc"
        primaryAction={{ label: "Go", onClick: vi.fn() }}
        isLoading
      />,
    );
    expect(screen.getByRole("button", { name: "Go" }).disabled).toBe(true);
  });

  it("calls primaryAction.onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <FeatureCard
        icon={StarIcon}
        title="Clickable"
        description="desc"
        primaryAction={{ label: "Submit", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders icon component", () => {
    render(
      <FeatureCard
        icon={StarIcon}
        title="With Icon"
        description="desc"
        primaryAction={{ label: "Go", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByTestId("star-icon")).toBeTruthy();
  });
});
