import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PublicDashboard } from "../src/components/PublicDashboard";
import { AirportDetail } from "../src/components/AirportDetail";
import { ReportSheet } from "../src/components/ReportSheet";

// TIR-366 follow-up: the TIR-308 lesson (text-slate-400 on white fails WCAG AA
// at ~2.56:1; text-slate-500 clears it at ~4.76:1) applies to every
// information-bearing text element on the anonymous dashboard surfaces, not
// just the footer. These tests lock the corrected classes so the defect class
// cannot regress on the Option A deploy target.

function mockFetchJson(json: unknown) {
  vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(json),
    })
  );
}

const staleReportedAt = () =>
  new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(); // 4h old > 3h stale window

function summaryRow(overrides: Record<string, unknown> = {}) {
  return {
    airport: "DEN",
    airportName: "Denver International Airport",
    timezone: "America/Denver",
    latestWaitMinutes: 42,
    latestReportedAt: staleReportedAt(),
    sampleSize: 5,
    trend: null,
    ...overrides,
  };
}

describe("PublicDashboard a11y contrast (TIR-308 rule)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stale wait value uses slate-500 (AA), never slate-400", async () => {
    mockFetchJson({ airports: [summaryRow()], airportCount: 1 });
    render(<PublicDashboard onSelectAirport={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Denver International Airport/ })).toBeDefined();
    });

    const row = screen.getByRole("button", { name: /Denver International Airport/ });
    const value = within(row).getByText("42 min");
    expect(value).toHaveClass("text-slate-500");
    expect(value).not.toHaveClass("text-slate-400");
  });

  it("fresh wait value keeps slate-900 and never regresses to slate-400", async () => {
    mockFetchJson({
      airports: [summaryRow({ latestReportedAt: new Date().toISOString() })],
      airportCount: 1,
    });
    render(<PublicDashboard onSelectAirport={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Denver International Airport/ })).toBeDefined();
    });

    const row = screen.getByRole("button", { name: /Denver International Airport/ });
    const value = within(row).getByText("42 min");
    expect(value).toHaveClass("text-slate-900");
    expect(value).not.toHaveClass("text-slate-400");
  });

  it("sample-size line uses slate-500 (AA), never slate-400", async () => {
    mockFetchJson({ airports: [summaryRow()], airportCount: 1 });
    render(<PublicDashboard onSelectAirport={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Denver International Airport/ })).toBeDefined();
    });

    const row = screen.getByRole("button", { name: /Denver International Airport/ });
    const sampleLine = within(row).getByText("5 reports");
    expect(sampleLine).toHaveClass("text-slate-500");
    expect(sampleLine).not.toHaveClass("text-slate-400");
  });
});

describe("AirportDetail chart label a11y contrast (TIR-308 rule)", () => {
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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("day-of-week bar labels use slate-500 (AA), never slate-400", async () => {
    mockFetchJson(stats);
    render(<AirportDetail code="DEN" onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Mon")).toBeDefined();
    });

    const label = screen.getByText("Mon");
    expect(label).toHaveClass("text-slate-500");
    expect(label).not.toHaveClass("text-slate-400");
  });

  it("hour bar labels use slate-500 (AA), never slate-400", async () => {
    mockFetchJson(stats);
    render(<AirportDetail code="DEN" onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("14")).toBeDefined();
    });

    const label = screen.getByText("14");
    expect(label).toHaveClass("text-slate-500");
    expect(label).not.toHaveClass("text-slate-400");
  });
});

describe("TIR-372 a11y sweep: placeholders and icon-only controls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dashboard filter placeholder uses slate-500 (AA), never slate-400", async () => {
    mockFetchJson({ airports: [], airportCount: 0 });
    render(<PublicDashboard onSelectAirport={() => {}} />);

    const input = await screen.findByPlaceholderText(/Filter airports/);
    expect(input).toHaveClass("placeholder:text-slate-500");
    expect(input).not.toHaveClass("placeholder:text-slate-400");
  });

  it("ReportSheet close icon-control uses slate-500 (>=3:1 non-text contrast), never slate-400", async () => {
    render(
      <ReportSheet open airportCode="DEN" onClose={() => {}} onReported={() => {}} />
    );

    // The X icon-control (backdrop is labeled "Close report dialog" and is
    // class-free by design).
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveClass("text-slate-500");
    expect(close).not.toHaveClass("text-slate-400");
  });
});
