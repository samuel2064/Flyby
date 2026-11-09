import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PremiumComparison } from "../src/components/PremiumComparison";

describe("PremiumComparison", () => {
  const tier1 = {
    label: "Free",
    features: ["Basic wait times", "Community reports"],
    isFree: true,
  };
  const tier2 = {
    label: "Premium",
    features: ["Basic wait times", "Community reports", "Predictive forecasts", "Push alerts"],
    isFree: false,
  };

  it("renders both tiers", () => {
    render(
      <PremiumComparison
        tier1={tier1}
        tier2={tier2}
        primaryCta={{ label: "Upgrade", onClick: () => {} }}
      />,
    );
    expect(screen.getByText("Free")).toBeTruthy();
    expect(screen.getByText("Premium")).toBeTruthy();
    const features = screen.getAllByText("Basic wait times");
    expect(features.length).toBe(2);
    expect(screen.getByText("Predictive forecasts")).toBeTruthy();
  });

  it("highlights premium tier by default", () => {
    render(
      <PremiumComparison
        tier1={tier1}
        tier2={tier2}
        primaryCta={{ label: "Upgrade", onClick: () => {} }}
      />,
    );
    const premiumCard = screen.getByText("Premium").closest("div");
    expect(premiumCard?.className).toContain("ring-brand-600");
  });

  it("highlights free tier when highlight='free'", () => {
    render(
      <PremiumComparison
        tier1={tier1}
        tier2={tier2}
        highlight="free"
        primaryCta={{ label: "Upgrade", onClick: () => {} }}
      />,
    );
    const freeCard = screen.getByText("Free").closest("div");
    expect(freeCard?.className).toContain("ring-brand-600");
  });

  it("renders primary CTA on both tiers", () => {
    render(
      <PremiumComparison
        tier1={tier1}
        tier2={tier2}
        primaryCta={{ label: "Choose", onClick: () => {} }}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: "Choose" });
    expect(buttons.length).toBe(2);
  });

  it("renders secondary CTA only on first tier", () => {
    render(
      <PremiumComparison
        tier1={tier1}
        tier2={tier2}
        primaryCta={{ label: "Upgrade", onClick: () => {} }}
        secondaryCta={{ label: "Learn more", onClick: () => {} }}
      />,
    );
    expect(screen.getByRole("button", { name: "Learn more" })).toBeTruthy();
  });

  it("calls primaryCta.onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <PremiumComparison
        tier1={tier1}
        tier2={tier2}
        primaryCta={{ label: "Go", onClick: onClick }}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Go" })[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
