import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubscriptionCheckout } from "../src/components/SubscriptionCheckout";

describe("SubscriptionCheckout", () => {
  it("renders price, email input, card input, and submit button", () => {
    const onSubmit = vi.fn();
    render(<SubscriptionCheckout onSubmit={onSubmit} />);
    expect(screen.getByText("$.99/month after 30-day free trial")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("button", { name: /pay now/i })).toBeTruthy();
  });

  it("calls onSubmit with email and token on form submit", () => {
    const onSubmit = vi.fn();
    render(<SubscriptionCheckout onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    const form = document.querySelector("form");
    fireEvent.submit(form!);
    expect(onSubmit).toHaveBeenCalledWith({ token: "", email: "a@b.com" });
  });

  it("disables submit button when isLoading", () => {
    render(<SubscriptionCheckout onSubmit={vi.fn()} isLoading />);
    const btn = screen.getByRole("button", { name: /processing/i });
    expect(btn.disabled).toBe(true);
  });

  it("shows error message when provided", () => {
    render(<SubscriptionCheckout onSubmit={vi.fn()} error="Card declined" />);
    const alert = document.querySelector("[role='alert']");
    expect(alert?.textContent).toContain("Card declined");
  });

  it("renders cancel button when onCancel provided", () => {
    const onCancel = vi.fn();
    render(<SubscriptionCheckout onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("hides marketing checkbox when showMarketingOpts is false", () => {
    render(<SubscriptionCheckout onSubmit={vi.fn()} showMarketingOpts={false} />);
    expect(screen.queryByLabelText(/travel tips and offers/i)).toBeNull();
  });

  it("uses custom price and billing details", () => {
    render(
      <SubscriptionCheckout
        price="$19.99/month"
        billingDetails={{ today: "$0 today", startsAfter: "$19.99 starts after trial" }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText("$19.99/month")).toBeTruthy();
    expect(screen.getByText("$0 today · $19.99 starts after trial")).toBeTruthy();
  });
});
