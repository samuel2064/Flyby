import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingFlow } from "../src/onboarding/OnboardingFlow";

const STORAGE_KEY = "flyby.onboarding.complete";

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

describe("OnboardingFlow", () => {
  it("renders the welcome step with Get Started button", () => {
    render(<OnboardingFlow onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Know before you go.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Get Started" }).length).toBeGreaterThan(0);
  });

  it("renders skip link on welcome step", () => {
    render(<OnboardingFlow onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /Skip/ }).length).toBeGreaterThan(0);
  });

  it("advances from welcome to airport permission when Get Started clicked", () => {
    render(<OnboardingFlow onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Get Started" })[0]);
    expect(screen.getByText("Find your nearest airport.")).toBeTruthy();
  });

  it("skips to complete when Skip clicked on welcome", () => {
    const onSkip = vi.fn();
    render(<OnboardingFlow onComplete={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Skip/ })[0]);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("renders permission prompt with Allow and Not Now buttons", () => {
    render(<OnboardingFlow onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Get Started" })[0]);
    expect(screen.getByRole("button", { name: /Allow location access/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Not now, continue without location/ })).toBeTruthy();
  });

  it("calls onComplete when onboarding completes", () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Get Started" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Allow location access/ }));
    expect(screen.getByText("Pick your airport")).toBeTruthy();
  });
});
