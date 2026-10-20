import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  SkeletonCard,
  SkeletonText,
  SkeletonHeading,
  SkeletonButton,
} from "../src/components/Skeleton";

describe("Skeleton components", () => {
  it("renders SkeletonCard with correct structure", () => {
    const { container } = render(<SkeletonCard />);

    const card = container.querySelector(".bg-white.rounded-lg.shadow");
    expect(card).toBeTruthy();
    expect(card?.classList.contains("animate-pulse")).toBe(true);

    // Check for skeleton elements
    const skeletonLines = container.querySelectorAll(".bg-gray-200");
    expect(skeletonLines.length).toBeGreaterThan(0);
  });

  it("renders SkeletonCard with custom className", () => {
    const { container } = render(<SkeletonCard className="custom-class" />);

    const card = container.querySelector(".custom-class");
    expect(card).toBeTruthy();
  });

  it("renders SkeletonText with correct classes", () => {
    const { container } = render(<SkeletonText />);

    const text = container.firstChild as HTMLElement;
    expect(text).toBeTruthy();
    expect(text.classList.contains("h-4")).toBe(true);
    expect(text.classList.contains("bg-gray-200")).toBe(true);
    expect(text.classList.contains("rounded")).toBe(true);
    expect(text.classList.contains("animate-pulse")).toBe(true);
  });

  it("renders SkeletonText with custom className", () => {
    const { container } = render(<SkeletonText className="w-48" />);

    const text = container.firstChild as HTMLElement;
    expect(text).toBeTruthy();
    expect(text.classList.contains("w-48")).toBe(true);
  });

  it("renders SkeletonHeading with correct classes", () => {
    const { container } = render(<SkeletonHeading />);

    const heading = container.firstChild as HTMLElement;
    expect(heading).toBeTruthy();
    expect(heading.classList.contains("h-7")).toBe(true);
    expect(heading.classList.contains("bg-gray-200")).toBe(true);
    expect(heading.classList.contains("rounded")).toBe(true);
    expect(heading.classList.contains("animate-pulse")).toBe(true);
  });

  it("renders SkeletonHeading with custom className", () => {
    const { container } = render(<SkeletonHeading className="w-64" />);

    const heading = container.firstChild as HTMLElement;
    expect(heading).toBeTruthy();
    expect(heading.classList.contains("w-64")).toBe(true);
  });

  it("renders SkeletonButton with correct classes", () => {
    const { container } = render(<SkeletonButton />);

    const button = container.firstChild as HTMLElement;
    expect(button).toBeTruthy();
    expect(button.classList.contains("h-10")).toBe(true);
    expect(button.classList.contains("bg-gray-200")).toBe(true);
    expect(button.classList.contains("rounded-lg")).toBe(true);
    expect(button.classList.contains("animate-pulse")).toBe(true);
  });

  it("renders SkeletonButton with custom className", () => {
    const { container } = render(<SkeletonButton className="w-32" />);

    const button = container.firstChild as HTMLElement;
    expect(button).toBeTruthy();
    expect(button.classList.contains("w-32")).toBe(true);
  });
});