import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressIndicator } from "../src/components/ProgressIndicator";

describe("ProgressIndicator", () => {
  it("renders dots equal to totalSteps", () => {
    render(<ProgressIndicator currentStep={2} totalSteps={5} />);
    const progress = screen.getByRole("progressbar");
    expect(progress.children.length).toBe(5);
  });

  it("marks completed steps with active color", () => {
    render(<ProgressIndicator currentStep={3} totalSteps={5} />);
    const progress = screen.getByRole("progressbar");
    const dots = Array.from(progress.children);
    expect(dots[0].className).toContain("bg-brand-600");
    expect(dots[1].className).toContain("bg-brand-600");
    expect(dots[2].className).toContain("bg-brand-600");
    expect(dots[3].className).toContain("bg-gray-300");
    expect(dots[4].className).toContain("bg-gray-300");
  });

  it("applies size classes", () => {
    const { rerender } = render(<ProgressIndicator currentStep={1} totalSteps={3} size="sm" />);
    const progress = screen.getByRole("progressbar");
    const dots = Array.from(progress.children);
    expect(dots[0].className).toContain("w-2");
    expect(dots[0].className).toContain("h-2");

    rerender(<ProgressIndicator currentStep={1} totalSteps={3} size="lg" />);
    const lgDots = Array.from(screen.getByRole("progressbar").children);
    expect(lgDots[0].className).toContain("w-4");
    expect(lgDots[0].className).toContain("h-4");
  });

  it("applies custom active/inactive colors", () => {
    render(
      <ProgressIndicator currentStep={1} totalSteps={3} activeColor="green-600" inactiveColor="red-300" />,
    );
    const progress = screen.getByRole("progressbar");
    const dots = Array.from(progress.children);
    expect(dots[0].className).toContain("bg-green-600");
    expect(dots[1].className).toContain("bg-red-300");
  });

  it("sets ARIA attributes", () => {
    render(<ProgressIndicator currentStep={2} totalSteps={4} />);
    const progress = screen.getByRole("progressbar");
    expect(progress.getAttribute("aria-valuenow")).toBe("2");
    expect(progress.getAttribute("aria-valuemin")).toBe("1");
    expect(progress.getAttribute("aria-valuemax")).toBe("4");
  });
});
