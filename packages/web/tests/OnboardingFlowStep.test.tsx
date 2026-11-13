import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OnboardingStep from "../src/onboarding/OnboardingStep";
import { ONBOARDING_STEPS } from "../src/onboarding/types";

describe("OnboardingStep (onboarding)", () => {
  const welcomeStep = ONBOARDING_STEPS[0];

  it("renders title and subhead", () => {
    render(
      <OnboardingStep
        step={welcomeStep}
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText(welcomeStep.title)).toBeTruthy();
    expect(screen.getByText(welcomeStep.subhead)).toBeTruthy();
  });

  it("renders primary action button", () => {
    const onNext = vi.fn();
    render(
      <OnboardingStep step={welcomeStep} onNext={onNext} onSkip={vi.fn()} />,
    );
    const btn = screen.getByText(welcomeStep.primaryCta);
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("renders skip button when skipAllowed", () => {
    render(
      <OnboardingStep step={welcomeStep} onNext={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Skip/ })).toBeTruthy();
  });

  it("does not render skip button when skipAllowed is false", () => {
    const completeStep = ONBOARDING_STEPS[5];
    render(
      <OnboardingStep step={completeStep} onNext={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /Skip/ })).toBeNull();
    expect(screen.getByText(completeStep.primaryCta)).toBeTruthy();
  });

  it("applies brand-600 gradient to primary button", () => {
    render(
      <OnboardingStep step={welcomeStep} onNext={vi.fn()} onSkip={vi.fn()} />,
    );
    const btn = screen.getByText(welcomeStep.primaryCta);
    expect(btn.className).toContain("from-brand-600");
  });
});
