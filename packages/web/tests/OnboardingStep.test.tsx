import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingStep } from "../src/components/OnboardingStep";

describe("OnboardingStep", () => {
  it("renders title, description, progress dots, and primary action", () => {
    render(
      <OnboardingStep
        step={1}
        title="Welcome"
        description="Get started with Flyby."
        primaryAction={{ label: "Continue", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByText("Welcome")).toBeTruthy();
    expect(screen.getByText("Get started with Flyby.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("renders progress dots equal to totalSteps", () => {
    render(
      <OnboardingStep
        step={2}
        totalSteps={4}
        title="Step 2"
        description="desc"
        primaryAction={{ label: "Next", onClick: vi.fn() }}
      />,
    );
    const dots = document.querySelectorAll('[aria-label^="Step"]');
    expect(dots.length).toBe(4);
  });

  it("marks completed steps as brand-600", () => {
    render(
      <OnboardingStep
        step={2}
        totalSteps={3}
        title="Step"
        description="desc"
        primaryAction={{ label: "Next", onClick: vi.fn() }}
      />,
    );
    const dots = document.querySelectorAll('[aria-label^="Step"]');
    expect(dots[0].className).toContain("bg-brand-600");
    expect(dots[1].className).toContain("bg-brand-600");
    expect(dots[2].className).toContain("bg-gray-300");
  });

  it("renders illustration component when provided", () => {
    const Illustration = ({ className }: { className?: string }) => (
      <svg className={className} data-testid="onboarding-illustration" />
    );
    render(
      <OnboardingStep
        step={1}
        title="With Illustration"
        description="desc"
        illustration={Illustration}
        primaryAction={{ label: "Go", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByTestId("onboarding-illustration")).toBeTruthy();
  });

  it("hides progress dots when showProgress is false", () => {
    render(
      <OnboardingStep
        step={1}
        showProgress={false}
        title="No Progress"
        description="desc"
        primaryAction={{ label: "Go", onClick: vi.fn() }}
      />,
    );
    expect(document.querySelectorAll('[aria-label^="Step"]')).toHaveLength(0);
  });

  it("renders secondary action when provided", () => {
    render(
      <OnboardingStep
        step={1}
        title="With Secondary"
        description="desc"
        primaryAction={{ label: "Primary", onClick: vi.fn() }}
        secondaryAction={{ label: "Skip", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
  });

  it("calls primaryAction.onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <OnboardingStep
        step={1}
        title="Clickable"
        description="desc"
        primaryAction={{ label: "Begin", onClick: onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
