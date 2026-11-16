import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AirportDetail } from "../src/components/AirportDetail";

// TIR-363 UX follow-up: the stats-drill error state previously had no way to
// recover except navigating away and back. These tests lock the Retry control
// (mirroring the PublicDashboard error card) so the drill can recover from a
// cold API start (the TIR-345 phantom-outage lesson) without a page change.

const stats = {
  airport: "DEN",
  airportName: "Denver International Airport",
  timezone: "America/Denver",
  sampleSize: 12,
  overall: { averageMinutes: 20, p50Minutes: 18, p90Minutes: 35, sampleSize: 12 },
  byHourOfDay: [
    { hour: 14, averageMinutes: 25, p50Minutes: 24, p90Minutes: 30, sampleSize: 3 },
  ],
  byDayOfWeek: [
    { day: 1, averageMinutes: 22, p50Minutes: 20, p90Minutes: 28, sampleSize: 2 },
  ],
  generatedAt: new Date().toISOString(),
};

// Fail-first / succeed-next style sequence; the last entry repeats so an
// unbounded call count (the 60s refresh timer) never throws.
function mockFetchSequence(responses: Array<{ ok: boolean; json?: unknown }>) {
  return vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => {
    const resp = responses.length > 1 ? responses.shift()! : responses[0];
    return Promise.resolve({
      ok: resp.ok,
      status: resp.ok ? 200 : 503,
      statusText: resp.ok ? "OK" : "Service Unavailable",
      json: () => Promise.resolve(resp.json ?? {}),
    } as Response);
  });
}

describe("AirportDetail retry control", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a Retry button in the error state when the stats fetch fails", async () => {
    mockFetchSequence([{ ok: false }]);
    render(<AirportDetail code="DEN" onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Could not load stats for DEN/)).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it("re-fetches and renders stats when Retry is clicked after a failure", async () => {
    mockFetchSequence([{ ok: false }, { ok: true, json: stats }]);
    render(<AirportDetail code="DEN" onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Could not load stats for DEN/)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText(/Based on 12 crowd reports/)).toBeDefined();
    });
    expect(screen.queryByText(/Could not load stats for DEN/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("keeps the error state when a retried fetch also fails", async () => {
    const spy = mockFetchSequence([{ ok: false }]);
    render(<AirportDetail code="DEN" onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Could not load stats for DEN/)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText(/Could not load stats for DEN/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });
});
