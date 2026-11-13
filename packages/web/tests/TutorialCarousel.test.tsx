import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TutorialCarousel from "../src/onboarding/TutorialCarousel";

describe("TutorialCarousel", () => {
  it("renders slide 1 with headline and body", () => {
    render(<TutorialCarousel onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Report a wait in 10 seconds.")).toBeTruthy();
    expect(screen.getByText("Tap Report, pick your wait time, submit. No typing, no signup.")).toBeTruthy();
  });

  it("renders pagination dots", () => {
    render(<TutorialCarousel onComplete={vi.fn()} onSkip={vi.fn()} />);
    const dots = document.querySelectorAll('[aria-label^="Slide"]');
    expect(dots.length).toBe(3);
  });

  it("advances to slide 2 when Next clicked", () => {
    render(<TutorialCarousel onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Next, tutorial slide 2/ }));
    expect(screen.getByText("Choose Standard or PreCheck.")).toBeTruthy();
  });

  it("renders I Got It on final slide and calls onComplete", () => {
    const onComplete = vi.fn();
    render(<TutorialCarousel onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Next, tutorial slide 2/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next, tutorial slide 3/ }));
    expect(screen.getByRole("button", { name: /I Got It/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /I Got It/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("calls onSkip when Skip clicked", () => {
    const onSkip = vi.fn();
    render(<TutorialCarousel onComplete={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: /Skip tutorial/ }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
