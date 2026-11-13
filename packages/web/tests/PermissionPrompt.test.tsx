import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PermissionPrompt from "../src/onboarding/PermissionPrompt";

describe("PermissionPrompt", () => {
  it("renders location permission prompt", () => {
    render(
      <PermissionPrompt
        type="location"
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.getByText("Find your nearest airport.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Allow location access/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Not now, continue without location/ })).toBeTruthy();
  });

  it("renders notification permission prompt", () => {
    render(
      <PermissionPrompt
        type="notification"
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.getByText("Get alerted when waits spike.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Allow push notifications for wait-time alerts/ })).toBeTruthy();
  });

  it("calls onAllow when Allow button clicked", () => {
    const onAllow = vi.fn();
    render(
      <PermissionPrompt type="location" onAllow={onAllow} onDeny={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Allow location access/ }));
    expect(onAllow).toHaveBeenCalledTimes(1);
  });

  it("calls onDeny when Not Now button clicked", () => {
    const onDeny = vi.fn();
    render(
      <PermissionPrompt type="location" onAllow={vi.fn()} onDeny={onDeny} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Not now, continue without location/ }));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("announces permission granted via aria-live", () => {
    render(
      <PermissionPrompt type="location" onAllow={vi.fn()} onDeny={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Allow location access/ }));
    expect(screen.getByText("Location access granted")).toBeTruthy();
  });
});
