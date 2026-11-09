import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionButton } from "../src/components/ActionButton";

describe("ActionButton", () => {
  it("renders with label and default variant/size", () => {
    render(<ActionButton label="Save" onClick={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeTruthy();
    expect(btn.className).toContain("from-brand-600");
    expect(btn.className).toContain("to-brand-700");
    expect(btn.className).toContain("text-base");
  });

  it("applies variant classes", () => {
    render(<ActionButton label="Secondary" onClick={vi.fn()} variant="secondary" />);
    const btn = screen.getByRole("button", { name: "Secondary" });
    expect(btn.className).toContain("text-brand-600");
    expect(btn.className).not.toContain("from-brand-600");

    render(<ActionButton label="Outline" onClick={vi.fn()} variant="outline" />);
    const outlineBtn = screen.getByRole("button", { name: "Outline" });
    expect(outlineBtn.className).toContain("border");
  });

  it("applies size classes", () => {
    render(<ActionButton label="Small" onClick={vi.fn()} size="sm" />);
    const btn = screen.getByRole("button", { name: "Small" });
    expect(btn.className).toContain("text-sm");

    render(<ActionButton label="Large" onClick={vi.fn()} size="lg" />);
    const lgBtn = screen.getByRole("button", { name: "Large" });
    expect(lgBtn.className).toContain("text-lg");
  });

  it("shows loading spinner when isLoading is true", () => {
    render(<ActionButton label="Loading" onClick={vi.fn()} isLoading />);
    const btn = screen.getAllByRole("button")[0];
    expect(btn.disabled).toBe(true);
    expect(btn.querySelector("svg")).toBeTruthy();
  });

  it("disables button when disabled prop is set", () => {
    render(<ActionButton label="Disabled" onClick={vi.fn()} disabled />);
    const btn = screen.getByRole("button", { name: "Disabled" });
    expect(btn.disabled).toBe(true);
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<ActionButton label="Clickable" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Clickable" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders icon and iconEnd when provided", () => {
    const StarIcon = ({ className }: { className?: string }) => (
      <svg className={className} data-testid="star-icon" />
    );
    render(
      <ActionButton label="With Icons" onClick={vi.fn()} icon={StarIcon} iconEnd={StarIcon} />,
    );
    expect(screen.getAllByTestId("star-icon").length).toBe(2);
  });

  it("enforces 44px minimum tap target", () => {
    render(<ActionButton label="TapTarget" onClick={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "TapTarget" });
    expect(btn.className).toContain("min-h-[44px]");
    expect(btn.className).toContain("min-w-[44px]");
  });
});
