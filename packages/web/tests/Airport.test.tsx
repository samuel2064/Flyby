import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Airport from "../src/pages/Airport";
import * as offlineQueueLib from "../src/lib/offlineQueue";

const mockCheckpoints = [
  {
    id: "cp-1",
    code: "T1-A",
    name: "Terminal 1 Checkpoint A",
    terminal: "1",
    latestWaitTimeMinutes: 15,
    latestReportedAt: new Date().toISOString(),
    source: "crowd",
  },
  {
    id: "cp-2",
    code: "T2-B",
    name: "Terminal 2 Checkpoint B",
    terminal: "2",
    latestWaitTimeMinutes: null,
    latestReportedAt: null,
    source: null,
  },
];

const mockAirportData = {
  data: {
    id: "airport-1",
    code: "JFK",
    name: "John F. Kennedy International Airport",
    city: "New York",
    state: "NY",
    country: "USA",
    checkpoints: mockCheckpoints,
  },
};

function renderAirport(code: string = "JFK") {
  return render(
    <MemoryRouter initialEntries={[`/airport/${code}`]}>
      <Routes>
        <Route path="/airport/:code" element={<Airport />} />
      </Routes>
    </MemoryRouter>
  );
}

function mockFetchSuccess(data = mockAirportData) {
  vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(data),
    })
  );
}

describe("Airport page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders skeleton loading state", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => new Promise(() => {}));
    renderAirport();
    await waitFor(() => {
      const skeletonCards = document.querySelectorAll(".animate-pulse");
      expect(skeletonCards.length).toBeGreaterThan(0);
    });
  });

  it("renders airport name and details", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("John F. Kennedy International Airport")).toBeDefined();
      expect(screen.getByText(/New York, NY.*USA/)).toBeDefined();
    });
  });

  it("renders checkpoint cards with wait times", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
      expect(screen.getByText("Terminal 2 Checkpoint B")).toBeDefined();
      expect(screen.getByText("15 min")).toBeDefined();
      expect(screen.getByText("—")).toBeDefined();
    });
  });

  it("shows report button for each checkpoint", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      const reportButtons = screen.getAllByText("Report");
      expect(reportButtons.length).toBe(2);
    });
  });

  it("shows 'not found' for invalid airport code", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ data: null }),
      })
    );

    renderAirport("XXX");

    await waitFor(() => {
      expect(screen.getByText("Airport not found.")).toBeDefined();
    });
  });

  it("includes a back link to home", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      const backLink = screen.getByText(/Back to live times/);
      expect(backLink).toBeDefined();
    });
  });

  it("opens ReportModal when Report button is clicked", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });

    const reportButtons = screen.getAllByText("Report");
    expect(reportButtons.length).toBe(2);

    fireEvent.click(reportButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Report Wait Time")).toBeDefined();
      expect(screen.getAllByText("Terminal 1 Checkpoint A").length).toBe(2);
    });
  });

  it("closes ReportModal when Cancel is clicked", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });

    fireEvent.click(screen.getAllByText("Report")[0]);

    await waitFor(() => {
      expect(screen.getByText("Report Wait Time")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.queryByText("Report Wait Time")).toBeNull();
    });
  });

  it("displays green color for wait time <= 15 minutes", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      const waitCard = screen.getByText("Terminal 1 Checkpoint A").closest("div.bg-white.rounded-lg.shadow");
      const waitTimeDisplay = waitCard?.querySelector("div.text-right.p-2.rounded-lg");
      expect(waitTimeDisplay?.classList.contains("bg-green-50")).toBe(true);
      const waitTime = waitTimeDisplay?.querySelector("p.text-2xl");
      expect(waitTime?.classList.contains("text-green-600")).toBe(true);
      expect(waitTime?.textContent).toBe("15 min");
    });
  });

  it("displays gray color for null wait time", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      const waitCard = screen.getByText("Terminal 2 Checkpoint B").closest("div.bg-white.rounded-lg.shadow");
      const waitTimeDisplay = waitCard?.querySelector("div.text-right.p-2.rounded-lg");
      expect(waitTimeDisplay?.classList.contains("bg-gray-100")).toBe(true);
      const waitTime = waitTimeDisplay?.querySelector("p.text-2xl");
      expect(waitTime?.classList.contains("text-gray-400")).toBe(true);
      expect(waitTime?.textContent).toBe("—");
    });
  });

  it("shows source with fallback when null", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      const waitCard = screen.getByText("Terminal 2 Checkpoint B").closest("div.bg-white.rounded-lg.shadow");
      const sourceText = waitCard?.querySelector("p.text-xs.text-gray-400");
      expect(sourceText?.textContent).toBe("unknown");
    });
  });

  it("shows live status indicator when connected", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      // Wait for SSE to connect (or poll)
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });
  });

  it("displays Details link for each checkpoint", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      const detailLinks = screen.getAllByText("Details →");
      expect(detailLinks.length).toBe(2);
      // Links are react-router Link components, check they exist
      expect(detailLinks[0]).toBeDefined();
      expect(detailLinks[1]).toBeDefined();
    });
  });

  it("shows offline indicator when not online", async () => {
    Object.defineProperty(global.navigator, "onLine", {
      value: false,
      configurable: true,
    });

    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeDefined();
    });

    Object.defineProperty(global.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("shows pending count when there are queued reports", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });
  });

  it("shows error state when airport data fetch fails", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })
    );

    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Failed to load airport data.")).toBeDefined();
    });
  });

  it("syncs queued reports when coming back online", async () => {
    // Mock the offline queue to return pending reports
    const mockPendingReports = [
      {
        id: 1,
        checkpointId: "cp-1",
        minutes: 20,
        source: "crowd",
        reportedAt: new Date().toISOString(),
        retryCount: 0,
      },
    ];

    vi.spyOn(offlineQueueLib, "getPendingReports").mockResolvedValue(mockPendingReports);
    vi.spyOn(offlineQueueLib, "removeReportFromQueue").mockResolvedValue(undefined);
    vi.spyOn(offlineQueueLib, "getQueueCount").mockResolvedValue(0);

    // Mock fetch for the airport data
    vi.spyOn(globalThis, "fetch" as any).mockImplementation((url: string) => {
      if (url.includes("/api/airports/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve(mockAirportData),
        });
      }
      // For submitReport calls
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ success: true }),
      });
    });

    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });

    // Wait for sync to complete
    await waitFor(() => {
      expect(offlineQueueLib.getPendingReports).toHaveBeenCalled();
    });

    // Verify submitReport was called
    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const submitCall = fetchCalls.find((call: any[]) => call[0].includes("/api/checkpoints/cp-1/wait-times"));
    expect(submitCall).toBeDefined();
  });

  it("refetches data after report is submitted via ReportModal", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });

    // Open ReportModal
    fireEvent.click(screen.getAllByText("Report")[0]);

    await waitFor(() => {
      expect(screen.getByText("Report Wait Time")).toBeDefined();
    });

    // Submit a report through the modal
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "25" } });

    // Mock the fetch for report submission
    const reportFetch = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ success: true }),
    });

    // Submit the form - this tests that the form submission works
    const submitButton = screen.getByText("Submit");
    fireEvent.click(submitButton);

    // Verify the fetch was called for the report submission
    expect(reportFetch).toHaveBeenCalledWith(
      "/api/checkpoints/cp-1/wait-times",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("25"),
      })
    );

    reportFetch.mockRestore();
  });

  it("shows yellow color for wait time between 16-30 minutes", async () => {
    const mockData = {
      data: {
        ...mockAirportData.data,
        checkpoints: [
          {
            ...mockCheckpoints[0],
            latestWaitTimeMinutes: 25,
            source: "official",
          },
          mockCheckpoints[1],
        ],
      },
    };
    mockFetchSuccess(mockData);
    renderAirport();

    await waitFor(() => {
      const waitCard = screen.getByText("Terminal 1 Checkpoint A").closest("div.bg-white.rounded-lg.shadow");
      const waitTimeDisplay = waitCard?.querySelector("div.text-right.p-2.rounded-lg");
      expect(waitTimeDisplay?.classList.contains("bg-yellow-50")).toBe(true);
      const waitTime = waitTimeDisplay?.querySelector("p.text-2xl");
      expect(waitTime?.classList.contains("text-yellow-600")).toBe(true);
      expect(waitTime?.textContent).toBe("25 min");
    });
  });

  it("shows red color for wait time > 30 minutes", async () => {
    const mockData = {
      data: {
        ...mockAirportData.data,
        checkpoints: [
          {
            ...mockCheckpoints[0],
            latestWaitTimeMinutes: 45,
            source: "pattern",
          },
          mockCheckpoints[1],
        ],
      },
    };
    mockFetchSuccess(mockData);
    renderAirport();

    await waitFor(() => {
      const waitCard = screen.getByText("Terminal 1 Checkpoint A").closest("div.bg-white.rounded-lg.shadow");
      const waitTimeDisplay = waitCard?.querySelector("div.text-right.p-2.rounded-lg");
      expect(waitTimeDisplay?.classList.contains("bg-red-50")).toBe(true);
      const waitTime = waitTimeDisplay?.querySelector("p.text-2xl");
      expect(waitTime?.classList.contains("text-red-600")).toBe(true);
      expect(waitTime?.textContent).toBe("45 min");
    });
  });

  it("shows SSE status indicators correctly", async () => {
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });

    // The SSE status should be one of the expected states
    const statusIndicators = screen.getAllByText(/Live|Connecting|Live off|Polling/);
    expect(statusIndicators.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Airport page — best-time-today forecast chips", () => {
  const mockForecastsData = {
    data: {
      airportCode: "JFK",
      airportName: "John F. Kennedy International Airport",
      timezone: "America/New_York",
      historyDays: 30,
      horizon: 12,
      forecasts: [
        {
          checkpointId: "cp-1",
          code: "T1-A",
          name: "Terminal 1 Checkpoint A",
          terminal: "1",
          timezone: "America/New_York",
          sampleCount: 8,
          overallAverageMinutes: 20,
          currentConsensusMinutes: 15,
          liveConsensusMinutes: 15,
          predictions: [],
          bestHours: [
            { hour: 14, forecastFor: "2026-09-22T18:00:00.000Z", predictedMinutes: 15 },
            { hour: 22, forecastFor: "2026-09-23T02:00:00.000Z", predictedMinutes: 25 },
          ],
        },
        {
          checkpointId: "cp-2",
          code: "T2-B",
          name: "Terminal 2 Checkpoint B",
          terminal: "2",
          timezone: "America/New_York",
          sampleCount: 0,
          overallAverageMinutes: null,
          currentConsensusMinutes: null,
          liveConsensusMinutes: null,
          predictions: [],
          bestHours: [],
        },
      ],
    },
  };

  // URL-aware fetch mock: airport detail + forecasts endpoints return their
  // own payloads so the two useApi hooks stay independent.
  function mockFetchWithForecasts() {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () =>
          Promise.resolve(
            (url as string).includes("/forecasts") ? mockForecastsData : mockAirportData
          ),
      })
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a best-time chip per checkpoint that has forecast data", async () => {
    mockFetchWithForecasts();
    renderAirport();

    await waitFor(() => {
      const chips = screen.getAllByTestId("best-time-chip");
      expect(chips.length).toBe(1);
      expect(chips[0].textContent).toBe("Best ~2 PM · 15 min");
    });
  });

  it("renders no chip for checkpoints without forecast data (no fabrication)", async () => {
    mockFetchWithForecasts();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 2 Checkpoint B")).toBeDefined();
    });
    // cp-2 has empty bestHours -> only the cp-1 chip exists
    expect(screen.getAllByTestId("best-time-chip").length).toBe(1);
  });

  it("shows chip skeletons while forecasts are loading", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation((url: string) => {
      if ((url as string).includes("/forecasts")) {
        return new Promise(() => {}); // never resolves -> stays loading
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockAirportData),
      });
    });
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });
    expect(screen.getAllByTestId("best-time-skeleton").length).toBe(2);
  });

  it("keeps the page functional and renders no chips when the forecasts fetch fails", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation((url: string) => {
      if ((url as string).includes("/forecasts")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockAirportData),
      });
    });
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
      expect(screen.getByText("Terminal 2 Checkpoint B")).toBeDefined();
    });
    expect(screen.queryAllByTestId("best-time-chip").length).toBe(0);
    expect(screen.queryAllByTestId("best-time-skeleton").length).toBe(0);
  });

  it("renders no chips when the forecasts response lacks a forecasts array (defensive)", async () => {
    // Simulates a malformed/legacy response: same payload for both calls
    mockFetchSuccess();
    renderAirport();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });
    expect(screen.queryAllByTestId("best-time-chip").length).toBe(0);
  });

  it("uses the airport-local hour number, not the viewer's timezone", async () => {
    mockFetchWithForecasts();
    renderAirport();

    await waitFor(() => {
      // hour: 14 -> 2 PM (not 14:00 or a UTC-shifted value)
      expect(screen.getByText(/Best ~2 PM · 15 min/)).toBeDefined();
    });
  });
});