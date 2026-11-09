import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeatureHighlight } from "../src/components/FeatureHighlight";

const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} data-testid="star-icon" />
);

describe("FeatureHighlight", () => {
  it("renders icon and label", () => {
    render(<FeatureHighlight icon={StarIcon} label="Fast check-ins" />);
    expect(screen.getByText("Fast check-ins")).toBeTruthy();
    expect(screen.getByTestId("star-icon")).toBeTruthy();
  });

  it("applies default variant styles", () => {
    render(<FeatureHighlight icon={StarIcon} label="Default" variant="default" />);
    const label = screen.getByText("Default");
    expect(label.className).toContain("text-gray-600");
    expect(label.className).not.toContain("font-medium");
  });

  it("applies highlight variant styles", () => {
    render(<FeatureHighlight icon={StarIcon} label="Highlight" variant="highlight" />);
    const label = screen.getByText("Highlight");
    expect(label.className).toContain("text-brand-600");
    expect(label.className).toContain("font-medium");
    const iconWrapper = label.previousElementSibling as HTMLElement;
    expect(iconWrapper.className).toContain("text-brand-600");
  });

  it("renders flex layout with spacing", () => {
    render(<FeatureHighlight icon={StarIcon} label="Layout" />);
    const container = screen.getByText("Layout").parentElement;
    expect(container?.className).toContain("flex");
    expect(container?.className).toContain("items-center");
    expect(container?.className).toContain("space-x-3");
  });
});
