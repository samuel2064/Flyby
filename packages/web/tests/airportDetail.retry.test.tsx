import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

// GET /api/checkpoints/airport/:code payload (native contract {data: [...]}).
// Covers both a checkpoint with fresh data and one with no reports yet.
const checkpoints = [
  {
    id: "ck-den-bridge",
    airportCode: "DEN",
    airportName: "Denver International Airport",
    code: "DEN-BRIDGE",
    name: "Bridge Security",
    terminal: "A",
    latestWaitTimeMinutes: 25,
    latestReportedAt: new Date().toISOString(),
    source: "crowd",
    reportType: "in_line",
    accuracy: 0.8,
    estimatedWaitTimeMinutes: 24,
  },
  {
    id: "ck-den-north",
    airportCode: "DEN",
    airportName: "Denver International Airport",
    code: "DEN-NORTH",
    name: "North Security",
    terminal: null,
    latestWaitTimeMinutes: null,
    latestReportedAt: null,
    source: null,
    reportType: null,
    accuracy: 0,
    estimatedWaitTimeMinutes: null,
  },
];

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
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Could not load stats for DEN/)).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it("re-fetches and renders stats when Retry is clicked after a failure", async () => {
    mockFetchSequence([{ ok: false }, { ok: true, json: stats }]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

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
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Could not load stats for DEN/)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      // load() fires 2 fetches (stats + checkpoint list): 2 on mount + 2 on retry.
      expect(spy).toHaveBeenCalledTimes(4);
    });
    expect(screen.getByText(/Could not load stats for DEN/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });
});

describe("AirportDetail checkpoint drill-in links", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders checkpoint links with latest wait data when both fetches succeed", async () => {
    mockFetchSequence([
      { ok: true, json: stats },
      { ok: true, json: { data: checkpoints } },
    ]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Based on 12 crowd reports/)).toBeDefined();
    });
    expect(screen.getByTestId("checkpoint-links")).toBeDefined();
    expect(screen.getByText("Bridge Security")).toBeDefined();
    expect(screen.getByText("North Security")).toBeDefined();
    expect(screen.getByText("Terminal A")).toBeDefined();
    // TIR-465: latest waits are whole minutes plus a reported-age suffix
    // (the value lives in its own span; match the pieces).
    expect(screen.getByText("25 min")).toBeDefined();
    expect(screen.getByText(/· reported just now/)).toBeDefined();
    expect(screen.getByText("No reports yet")).toBeDefined();
    expect(
      screen.getByRole("link", { name: /Bridge Security/ }).getAttribute("href")
    ).toBe("/checkpoint/ck-den-bridge");
  });

  it("hides the checkpoint section when the checkpoint fetch fails (stats still render)", async () => {
    mockFetchSequence([{ ok: true, json: stats }, { ok: false }]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Based on 12 crowd reports/)).toBeDefined();
    });
    expect(screen.queryByTestId("checkpoint-links")).toBeNull();
  });

  it("renders no checkpoint section when the airport has no checkpoints", async () => {
    mockFetchSequence([
      { ok: true, json: stats },
      { ok: true, json: { data: [] } },
    ]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Based on 12 crowd reports/)).toBeDefined();
    });
    expect(screen.queryByTestId("checkpoint-links")).toBeNull();
  });
});

// TIR-465 display conventions on the checkpoint cards: whole-minute latest
// waits, shared severity color coding (color + text label, never color alone),
// and staleness de-emphasis with the report age.
describe("AirportDetail checkpoint card display conventions (TIR-465)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function checkpointFixture(overrides: Partial<typeof checkpoints[number]>) {
    return { ...checkpoints[0], ...overrides };
  }

  it("renders the severity chip per the shared wait-color thresholds with a text label", async () => {
    // 25 min -> severityFor = 'moderate' (15 <= x < 30) -> amber chip + label.
    mockFetchSequence([
      { ok: true, json: stats },
      { ok: true, json: { data: [checkpointFixture({ latestWaitTimeMinutes: 25 })] } },
    ]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("25 min")).toBeDefined();
    });
    const chip = screen.getByTestId("checkpoint-severity-moderate");
    expect(chip.textContent).toContain("Moderate");
    expect(chip.className).toContain("bg-amber-100");
    expect(chip.className).toContain("text-amber-800");
    // Color is never the sole signal: the link's accessible name carries the
    // severity label too.
    expect(
      screen.getByRole("link", { name: /Bridge Security: Moderate, latest wait 25 min/ })
    ).toBeDefined();
  });

  it("renders short waits on the green chip band", async () => {
    mockFetchSequence([
      { ok: true, json: stats },
      { ok: true, json: { data: [checkpointFixture({ latestWaitTimeMinutes: 10 })] } },
    ]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("10 min")).toBeDefined();
    });
    const chip = screen.getByTestId("checkpoint-severity-short");
    expect(chip.textContent).toContain("Short");
    expect(chip.className).toContain("bg-emerald-100");
  });

  it("renders very long waits on the red chip band", async () => {
    mockFetchSequence([
      { ok: true, json: stats },
      { ok: true, json: { data: [checkpointFixture({ latestWaitTimeMinutes: 60 })] } },
    ]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("60 min")).toBeDefined();
    });
    const chip = screen.getByTestId("checkpoint-severity-very-long");
    expect(chip.textContent).toContain("Very long");
    expect(chip.className).toContain("bg-red-100");
  });

  it("renders latest waits as whole minutes (crowd-report convention), not averages", async () => {
    mockFetchSequence([
      { ok: true, json: stats },
      {
        ok: true,
        json: {
          data: [checkpointFixture({ latestWaitTimeMinutes: 12.4 })],
        },
      },
    ]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("12 min")).toBeDefined();
    });
    // A fractional report value must not leak through as "12.4 min".
    expect(screen.queryByText(/12\.4/)).toBeNull();
  });

  it("de-emphasizes stale waits: badge, muted value, and report age", async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    mockFetchSequence([
      { ok: true, json: stats },
      { ok: true, json: { data: [checkpointFixture({ latestReportedAt: fourHoursAgo })] } },
    ]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/reported 4h ago/)).toBeDefined();
    });
    expect(screen.getByTestId("checkpoint-stale-badge")).toBeDefined();
    expect(screen.getByRole("link", { name: /\(stale\)/ })).toBeDefined();
  });

  it("shows no severity chip or stale badge for checkpoints without reports", async () => {
    mockFetchSequence([
      { ok: true, json: stats },
      { ok: true, json: { data: [checkpoints[1]] } },
    ]);
    render(
      <MemoryRouter>
        <AirportDetail code="DEN" onBack={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("No reports yet")).toBeDefined();
    });
    expect(screen.queryByTestId(/checkpoint-severity-/)).toBeNull();
    expect(screen.queryByTestId("checkpoint-stale-badge")).toBeNull();
  });
});
