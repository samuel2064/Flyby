import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { states } from "../src/components";

describe("states.PermissionDeniedState", () => {
  it("renders location denied headline and actions", () => {
    const onRetry = vi.fn();
    const onOpenSettings = vi.fn();
    const onDismiss = vi.fn();
    render(
      <states.PermissionDeniedState
        type="location"
        onRetry={onRetry}
        onOpenSettings={onOpenSettings}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText("Location access denied.")).toBeTruthy();
    expect(screen.getByText("Search airports")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("renders notification denied headline and actions", () => {
    render(
      <states.PermissionDeniedState
        type="notification"
        onRetry={vi.fn()}
        onOpenSettings={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Notifications disabled.")).toBeTruthy();
    expect(screen.getByText("Open Settings")).toBeTruthy();
    expect(screen.getByText("Continue without alerts")).toBeTruthy();
  });

  it("calls onRetry when Try again clicked for location", () => {
    const onRetry = vi.fn();
    render(
      <states.PermissionDeniedState
        type="location"
        onRetry={onRetry}
        onOpenSettings={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenSettings when Open Settings clicked for notification", () => {
    const onOpenSettings = vi.fn();
    render(
      <states.PermissionDeniedState
        type="notification"
        onRetry={vi.fn()}
        onOpenSettings={onOpenSettings}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Open Settings"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
