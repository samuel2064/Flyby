import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InfoSection } from "../src/components/InfoSection";

describe("InfoSection", () => {
  it("renders title and toggle button", () => {
    render(<InfoSection title="Details" content="Some content" />);
    expect(screen.getByText("Details")).toBeTruthy();
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("hides content when closed by default", () => {
    render(<InfoSection title="Details" content="Hidden content" />);
    expect(screen.queryByText("Hidden content")).toBeNull();
  });

  it("shows content when isOpen is true", () => {
    render(<InfoSection title="Details" content="Visible content" isOpen />);
    expect(screen.getByText("Visible content")).toBeTruthy();
  });

  it("toggles content via isOpen prop", () => {
    const { rerender } = render(
      <InfoSection title="Toggle" content="Togglable content" isOpen={false} />,
    );
    expect(document.body.textContent).not.toContain("Togglable content");
    rerender(<InfoSection title="Toggle" content="Togglable content" isOpen />);
    expect(document.body.textContent).toContain("Togglable content");
  });

  it("calls onToggle when provided instead of internal toggle", () => {
    const onToggle = vi.fn();
    render(<InfoSection title="Controlled" content="content" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders icon when provided", () => {
    const InfoIcon = ({ className }: { className?: string }) => (
      <svg className={className} data-testid="info-icon" />
    );
    render(<InfoSection title="With Icon" content="content" icon={InfoIcon} />);
    expect(screen.getByTestId("info-icon")).toBeTruthy();
  });

  it("sets aria-expanded correctly", () => {
    const { rerender } = render(
      <InfoSection title="Aria" content="content" isOpen={false} />,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    rerender(<InfoSection title="Aria" content="content" isOpen />);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});
