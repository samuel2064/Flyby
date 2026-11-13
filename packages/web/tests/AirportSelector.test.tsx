import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AirportSelector from "../src/onboarding/AirportSelector";

describe("AirportSelector", () => {
  it("renders popular airport chips", () => {
    render(<AirportSelector onSelect={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole("button", { name: /JFK John F. Kennedy International, New Yorknot selected/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /LAX Los Angeles International, Los Angelesnot selected/ })).toBeTruthy();
  });

  it("selects an airport chip and enables confirm", () => {
    const onSelect = vi.fn();
    render(<AirportSelector onSelect={onSelect} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /JFK John F. Kennedy International, New Yorknot selected/ }));
    expect(screen.getByRole("button", { name: "Select JFK" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select JFK" }));
    expect(onSelect).toHaveBeenCalledWith("JFK");
  });

  it("renders search input and filters results", () => {
    render(<AirportSelector onSelect={vi.fn()} onSkip={vi.fn()} />);
    const input = screen.getByLabelText("Search airports by code or city");
    fireEvent.change(input, { target: { value: "LAX" } });
    expect(screen.getByRole("button", { name: /LAX Los Angeles International, Los Angelesnot selected/ })).toBeTruthy();
  });

  it("calls onSkip when Skip clicked", () => {
    const onSkip = vi.fn();
    render(<AirportSelector onSelect={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByText("Skip"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
