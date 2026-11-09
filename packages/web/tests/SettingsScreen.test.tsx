import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsScreen } from "../src/components/SettingsScreen";

describe("SettingsScreen", () => {
  it("renders subscription status and manage button", () => {
    render(
      <SettingsScreen
        subscriptionStatus="active"
        userEmail="user@example.com"
        onManageSubscription={vi.fn()}
        onNotificationPreferences={vi.fn()}
      />,
    );
    expect(screen.getByText("Premium")).toBeTruthy();
    expect(screen.getByText("user@example.com")).toBeTruthy();
    expect(screen.getAllByText("Active")[1]).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage subscription" })).toBeTruthy();
  });

  it("applies status badge colors", () => {
    const { container } = render(
      <SettingsScreen
        subscriptionStatus="trial"
        userEmail="u@e.com"
        onManageSubscription={vi.fn()}
        onNotificationPreferences={vi.fn()}
      />,
    );
    const badge = container.querySelector("span.font-medium");
    expect(badge?.className).toContain("text-yellow-800");

    const { container: c2 } = render(
      <SettingsScreen
        subscriptionStatus="expired"
        userEmail="u@e.com"
        onManageSubscription={vi.fn()}
        onNotificationPreferences={vi.fn()}
      />,
    );
    const expiredBadge = c2.querySelector("span.font-medium");
    expect(expiredBadge?.className).toContain("text-red-800");
  });

  it("shows renewal date when provided", () => {
    render(
      <SettingsScreen
        subscriptionStatus="active"
        renewalDate="2026-12-01"
        userEmail="u@e.com"
        onManageSubscription={vi.fn()}
        onNotificationPreferences={vi.fn()}
      />,
    );
    expect(screen.getByText("Renews 2026-12-01")).toBeTruthy();
  });

  it("calls onManageSubscription when clicked", () => {
    const onManage = vi.fn();
    render(
      <SettingsScreen
        subscriptionStatus="active"
        userEmail="u@e.com"
        onManageSubscription={onManage}
        onNotificationPreferences={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it("renders billing history section when onViewBillingHistory provided", () => {
    render(
      <SettingsScreen
        subscriptionStatus="active"
        userEmail="u@e.com"
        onManageSubscription={vi.fn()}
        onViewBillingHistory={vi.fn()}
        onNotificationPreferences={vi.fn()}
      />,
    );
    expect(screen.getByText("Billing history")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View billing history" })).toBeTruthy();
  });

  it("renders notifications section when onNotificationPreferences provided", () => {
    render(
      <SettingsScreen
        subscriptionStatus="active"
        userEmail="u@e.com"
        onManageSubscription={vi.fn()}
        onNotificationPreferences={vi.fn()}
      />,
    );
    expect(screen.getByText("Notifications")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage notification preferences" })).toBeTruthy();
  });

  it("omits billing history and notifications sections when not provided", () => {
    render(
      <SettingsScreen
        subscriptionStatus="active"
        userEmail="u@e.com"
        onManageSubscription={vi.fn()}
      />,
    );
    expect(screen.queryByText("Billing history")).toBeNull();
    expect(screen.queryByText("Notifications")).toBeNull();
  });
});
