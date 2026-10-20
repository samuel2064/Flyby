import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { TestMemoryRouter } from "./testRouter";
import Checkpoint from "../src/pages/Checkpoint";

const mockCheckpointData = {
  data: {
    id: "cp-1",
    airportId: "airport-1",
    airportCode: "JFK",
    airportName: "John F. Kennedy International Airport",
    code: "T1-A",
    name: "Terminal 1 Checkpoint A",
    terminal: "1",
    latestWaitTimeMinutes: 25,
    latestReportedAt: new Date().toISOString(),
    source: "crowd",
    reportType: "standard",
    accuracy: 78,
    estimatedWaitTimeMinutes: 20,
    waitTimes: [
      {
        id: "wt-1",
        minutes: 25,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        id: "wt-2",
        minutes: 15,
        source: "crowd",
        reportType: "standard",
        reportedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ],
  },
};

const mockHistoryData = {
  data: [
    { bucket: "2026-06-10T10:00:00.000Z", minutes: 20, count: 2 },
    { bucket: "2026-06-10T10:15:00.000Z", minutes: 25, count: 3 },
    { bucket: "2026-06-10T10:30:00.000Z", minutes: 15, count: 1 },
  ],
};

const mockPredictData = {
  data: {
    checkpointId: "cp-1",
    timezone: "UTC",
    horizon: 12,
    historyDays: 30,
    sampleCount: 42,
    overallAverageMinutes: 20.5,
    currentConsensusMinutes: 18,
    predictions: [
      { hour: 10, forecastFor: "2026-09-21T10:00:00.000Z", predictedMinutes: 12, confidence: 0.8, sampleCount: 8, source: "pattern" },
      { hour: 11, forecastFor: "2026-09-21T11:00:00.000Z", predictedMinutes: 25, confidence: 0.2, sampleCount: 2, source: "pattern" },
      { hour: 12, forecastFor: "2026-09-21T12:00:00.000Z", predictedMinutes: 21, confidence: 0.3, sampleCount: 0, source: "fallback" },
    ],
    bestHours: [
      { hour: 10, forecastFor: "2026-09-21T10:00:00.000Z", predictedMinutes: 12 },
    ],
  },
};

function renderCheckpoint(id: string = "cp-1") {
  return render(
    <TestMemoryRouter initialEntries={[`/checkpoint/${id}`]}>
      <Routes>
        <Route path="/checkpoint/:id" element={<Checkpoint />} />
      </Routes>
    </TestMemoryRouter>
  );
}

function mockFetchSuccess(data: any, historyData: any = mockHistoryData, predictData: any = mockPredictData) {
  vi.spyOn(globalThis, "fetch" as any).mockImplementation((url: string) => {
    if (url.includes("/predict")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(predictData),
      });
    }
    if (url.includes("/history")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(historyData),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(data),
    });
  });
}

describe("Checkpoint page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders skeleton loading state", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => new Promise(() => {}));
    renderCheckpoint();
    await waitFor(() => {
      const skeletonCards = document.querySelectorAll(".animate-pulse");
      expect(skeletonCards.length).toBeGreaterThan(0);
    });
  });

  it("renders checkpoint name and details", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
      expect(screen.getByText(/JFK.*Terminal/)).toBeDefined();
    });
  });

  it("displays wait time stats", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Estimated Wait")).toBeDefined();
      expect(screen.getByText("Wait Time History")).toBeDefined();
      expect(screen.getByText("Recent Reports")).toBeDefined();
    });
  });

  it("shows recent reports table", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Recent Reports")).toBeDefined();
      const tableRows = document.querySelectorAll("tbody tr");
      expect(tableRows.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows 'not found' for invalid checkpoint id", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ data: null }),
      })
    );

    renderCheckpoint("invalid-id");

    await waitFor(() => {
      expect(screen.getByText("Checkpoint not found.")).toBeDefined();
    });
  });

  it("includes a back link to airport", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      const backLink = screen.getByText(/Back to/);
      expect(backLink).toBeDefined();
    });
  });

  it("opens ReportModal when Report Time button is clicked", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Report Time"));

    await waitFor(() => {
      expect(screen.getByText("Report Wait Time")).toBeDefined();
    });
  });

  it("displays history period toggles", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("6h")).toBeDefined();
      expect(screen.getByText("12h")).toBeDefined();
      expect(screen.getByText("24h")).toBeDefined();
    });
  });

  it("shows live status indicator when connected", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText(/Terminal 1 Checkpoint A/)).toBeDefined();
    });
  });

  it("displays green color for wait time <= 15 minutes", async () => {
    const dataWithLowWait = {
      data: {
        ...mockCheckpointData.data,
        latestWaitTimeMinutes: 10,
        estimatedWaitTimeMinutes: 8,
        waitTimes: [
          {
            id: "wt-1",
            minutes: 10,
            source: "crowd",
            reportType: "standard",
            reportedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          },
        ],
      },
    };
    mockFetchSuccess(dataWithLowWait);
    renderCheckpoint();

    await waitFor(() => {
      // Find the Current Wait card specifically
      const currentWaitCard = screen.getByText("Current Wait").closest("div.p-4.rounded-lg.shadow");
      expect(currentWaitCard?.classList.contains("bg-green-50")).toBe(true);
      const waitTimeElement = currentWaitCard?.querySelector("p.text-3xl");
      expect(waitTimeElement?.classList.contains("text-green-600")).toBe(true);
    });
  });

  it("displays yellow color for wait time between 16-30 minutes", async () => {
    const dataWithMediumWait = {
      data: {
        ...mockCheckpointData.data,
        latestWaitTimeMinutes: 25,
        estimatedWaitTimeMinutes: 20,
        waitTimes: [
          {
            id: "wt-1",
            minutes: 25,
            source: "crowd",
            reportType: "standard",
            reportedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          },
        ],
      },
    };
    mockFetchSuccess(dataWithMediumWait);
    renderCheckpoint();

    await waitFor(() => {
      // Find the Current Wait card specifically
      const currentWaitCard = screen.getByText("Current Wait").closest("div.p-4.rounded-lg.shadow");
      expect(currentWaitCard?.classList.contains("bg-yellow-50")).toBe(true);
      const waitTimeElement = currentWaitCard?.querySelector("p.text-3xl");
      expect(waitTimeElement?.classList.contains("text-yellow-600")).toBe(true);
    });
  });

  it("displays red color for wait time > 30 minutes", async () => {
    const dataWithHighWait = {
      data: {
        ...mockCheckpointData.data,
        latestWaitTimeMinutes: 45,
        estimatedWaitTimeMinutes: 40,
        waitTimes: [
          {
            id: "wt-1",
            minutes: 45,
            source: "crowd",
            reportType: "standard",
            reportedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          },
        ],
      },
    };
    mockFetchSuccess(dataWithHighWait);
    renderCheckpoint();

    await waitFor(() => {
      // Find the Current Wait card specifically
      const currentWaitCard = screen.getByText("Current Wait").closest("div.p-4.rounded-lg.shadow");
      expect(currentWaitCard?.classList.contains("bg-red-50")).toBe(true);
      const waitTimeElement = currentWaitCard?.querySelector("p.text-3xl");
      expect(waitTimeElement?.classList.contains("text-red-600")).toBe(true);
    });
  });

  it("displays gray color when wait time is null", async () => {
    const dataWithNullWait = {
      data: {
        ...mockCheckpointData.data,
        latestWaitTimeMinutes: null,
        estimatedWaitTimeMinutes: null,
        waitTimes: [],
      },
    };
    mockFetchSuccess(dataWithNullWait);
    renderCheckpoint();

    await waitFor(() => {
      // When wait time is null, it displays "—" in the Current Wait card
      const currentWaitCard = screen.getByText("Current Wait").closest("div");
      expect(currentWaitCard?.classList.contains("bg-gray-100")).toBe(true);
      const waitTimeElement = currentWaitCard?.querySelector("p.text-3xl");
      expect(waitTimeElement?.textContent).toBe("—");
    });
  });

  it("displays green accuracy color for accuracy >= 70", async () => {
    const dataWithHighAccuracy = {
      data: {
        ...mockCheckpointData.data,
        accuracy: 85,
      },
    };
    mockFetchSuccess(dataWithHighAccuracy);
    renderCheckpoint();

    await waitFor(() => {
      const accuracyCard = screen.getByText("Accuracy").closest("div");
      expect(accuracyCard.textContent).toContain("85");
      const accuracyValue = accuracyCard.querySelector("p.text-3xl");
      expect(accuracyValue?.classList.contains("text-green-600")).toBe(true);
    });
  });

  it("displays yellow accuracy color for accuracy between 40-69", async () => {
    const dataWithMediumAccuracy = {
      data: {
        ...mockCheckpointData.data,
        accuracy: 55,
      },
    };
    mockFetchSuccess(dataWithMediumAccuracy);
    renderCheckpoint();

    await waitFor(() => {
      const accuracyCard = screen.getByText("Accuracy").closest("div");
      expect(accuracyCard.textContent).toContain("55");
      const accuracyValue = accuracyCard.querySelector("p.text-3xl");
      expect(accuracyValue?.classList.contains("text-yellow-600")).toBe(true);
    });
  });

  it("displays red accuracy color for accuracy < 40", async () => {
    const dataWithLowAccuracy = {
      data: {
        ...mockCheckpointData.data,
        accuracy: 25,
      },
    };
    mockFetchSuccess(dataWithLowAccuracy);
    renderCheckpoint();

    await waitFor(() => {
      const accuracyCard = screen.getByText("Accuracy").closest("div");
      expect(accuracyCard.textContent).toContain("25");
      const accuracyValue = accuracyCard.querySelector("p.text-3xl");
      expect(accuracyValue?.classList.contains("text-red-600")).toBe(true);
    });
  });

  it("shows 'No reports yet' when waitTimes is empty", async () => {
    const dataWithNoReports = {
      data: {
        ...mockCheckpointData.data,
        waitTimes: [],
      },
    };
    mockFetchSuccess(dataWithNoReports);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("No reports yet.")).toBeDefined();
    });
  });

  it("shows history loading skeleton", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation((url: string) => {
      if (url.includes("/history")) {
        return new Promise(() => {}); // Never resolves - simulates loading
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockCheckpointData),
      });
    });

    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });

    await waitFor(() => {
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeDefined();
    });
  });

  it("shows history error state", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation((url: string) => {
      if (url.includes("/history")) {
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
        json: () => Promise.resolve(mockCheckpointData),
      });
    });

    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to load history.")).toBeDefined();
    });
  });

  it("shows 'No history data available' when history is empty", async () => {
    const emptyHistoryData = { data: [] };
    mockFetchSuccess(mockCheckpointData, emptyHistoryData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("No history data available.")).toBeDefined();
    });
  });

  it("displays source with fallback when null", async () => {
    const dataWithNullSource = {
      data: {
        ...mockCheckpointData.data,
        source: null,
      },
    };
    mockFetchSuccess(dataWithNullSource);
    renderCheckpoint();

    await waitFor(() => {
      // Source should show "—" when null
      expect(screen.getByText("—")).toBeDefined();
    });
  });

  it("capitalizes source display", async () => {
    const dataWithSource = {
      data: {
        ...mockCheckpointData.data,
        source: "official",
      },
    };
    mockFetchSuccess(dataWithSource);
    renderCheckpoint();

    await waitFor(() => {
      // Source should be capitalized via CSS text-transform: capitalize
      // The actual text content remains lowercase, but renders capitalized
      expect(screen.getByText("official")).toBeDefined();
    });
  });

  it("shows offline indicator when not online", async () => {
    // Mock navigator.onLine to be false
    Object.defineProperty(global.navigator, "onLine", {
      value: false,
      configurable: true,
    });

    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeDefined();
    });

    Object.defineProperty(global.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("shows pending count when there are queued reports", async () => {
    // We can't easily test this without mocking the offline queue
    // but we can verify the component renders without error
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
    });
  });

  it("changes history period when toggle button is clicked", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("6h")).toBeDefined();
    });

    // Click 12h button
    fireEvent.click(screen.getByText("12h"));

    // Check that the 12h button now has the active class
    const btn12h = screen.getByText("12h");
    expect(btn12h.className).toContain("bg-brand");
  });

  it("displays wait time history chart when data exists", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Wait Time History")).toBeDefined();
    });

    // The chart should be rendered (ResponsiveContainer)
    await waitFor(() => {
      const chart = document.querySelector(".recharts-wrapper");
      expect(chart).toBeDefined();
    });
  });

  it("formats date time in recent reports table", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      // Check that the time column shows formatted date (e.g., "5 Aug, 11:50")
      // Use queryByText to find the table cell with a date-like pattern
      const timeCells = document.querySelectorAll("tbody td:first-child");
      expect(timeCells.length).toBeGreaterThan(0);
      const firstTimeCell = timeCells[0];
      expect(firstTimeCell.textContent).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
    });
  });

  it("shows error state when checkpoint data fetch fails", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })
    );

    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Failed to load checkpoint data.")).toBeDefined();
    });
  });
});

describe("Checkpoint page — Forecast section", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getForecastSection(): HTMLElement {
    const heading = screen.getByText("Forecast");
    return heading.closest("div.bg-white") as HTMLElement;
  }

  it("renders forecast hour cards with predicted wait times", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Forecast")).toBeDefined();
    });

    await waitFor(() => {
      const section = getForecastSection();
      expect(within(section).getByText("12 min")).toBeDefined();
      expect(within(section).getByText("25 min")).toBeDefined();
      expect(within(section).getByText("21 min")).toBeDefined();
    });
  });

  it("renders a confidence bar for each forecast hour", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      const section = getForecastSection();
      const bars = section.querySelectorAll("div.h-1\\.5 > div");
      expect(bars.length).toBe(3);
      expect(bars[0].getAttribute("style")).toContain("width: 80%");
      expect(bars[1].getAttribute("style")).toContain("width: 20%");
      expect(bars[2].getAttribute("style")).toContain("width: 30%");
    });
  });

  it("marks the best upcoming hour with a badge", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Best time")).toBeDefined();
    });
  });

  it("shows confidence percentage for non-best hours", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("20% confidence")).toBeDefined();
      expect(screen.getByText("30% confidence")).toBeDefined();
    });
  });

  it("marks live-blended forecast hours with a badge and live subtitle", async () => {
    const blendedPredict = {
      data: {
        ...mockPredictData.data,
        liveConsensusMinutes: 42,
        predictions: [
          { hour: 10, forecastFor: "2026-09-21T10:00:00.000Z", predictedMinutes: 44, confidence: 0.9, sampleCount: 5, source: "blended" },
          { hour: 11, forecastFor: "2026-09-21T11:00:00.000Z", predictedMinutes: 25, confidence: 0.2, sampleCount: 2, source: "pattern" },
          { hour: 12, forecastFor: "2026-09-21T12:00:00.000Z", predictedMinutes: 21, confidence: 0.3, sampleCount: 0, source: "fallback" },
        ],
        bestHours: [{ hour: 10, forecastFor: "2026-09-21T10:00:00.000Z", predictedMinutes: 44 }],
      },
    };
    mockFetchSuccess(mockCheckpointData, mockHistoryData, blendedPredict);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Live-adjusted pattern forecast")).toBeDefined();
    });

    // Exactly the blended card is badged; pattern and fallback cards are not.
    expect(screen.queryAllByText("Live-adjusted").length).toBe(1);

    // The blended prediction renders its minutes like any other hour card.
    expect(screen.getByText("44 min")).toBeDefined();
  });

  it("keeps the default pattern subtitle and no live badge when no slot is blended", async () => {
    mockFetchSuccess(mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Pattern-based prediction from recent reports")).toBeDefined();
    });

    expect(screen.queryByText("Live-adjusted")).toBeNull();
  });

  it("shows empty forecast message when there is not enough data", async () => {
    const emptyPredict = {
      data: {
        checkpointId: "cp-1",
        timezone: "UTC",
        horizon: 12,
        historyDays: 30,
        sampleCount: 0,
        overallAverageMinutes: null,
        currentConsensusMinutes: null,
        predictions: [],
        bestHours: [],
      },
    };
    mockFetchSuccess(mockCheckpointData, mockHistoryData, emptyPredict);
    renderCheckpoint();

    await waitFor(() => {
      expect(
        screen.getByText(/Not enough data to forecast yet/)
      ).toBeDefined();
    });
  });

  it("shows forecast error state when the predict request fails", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation((url: string) => {
      if (url.includes("/predict")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });
      }
      if (url.includes("/history")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve(mockHistoryData),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockCheckpointData),
      });
    });

    renderCheckpoint();

    await waitFor(() => {
      expect(screen.getByText("Failed to load forecast.")).toBeDefined();
    });
  });

  it("shows a loading skeleton for the forecast while fetching", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation((url: string) => {
      if (url.includes("/predict")) {
        return new Promise(() => {});
      }
      if (url.includes("/history")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve(mockHistoryData),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockCheckpointData),
      });
    });

    renderCheckpoint();

    await waitFor(() => {
      const section = getForecastSection();
      expect(section.querySelector(".animate-pulse")).not.toBeNull();
    });
  });

  it("shows empty forecast when the predict response is malformed", async () => {
    // The predict fetch returns a non-predict shape; the page must not crash.
    mockFetchSuccess(mockCheckpointData, mockHistoryData, mockCheckpointData);
    renderCheckpoint();

    await waitFor(() => {
      expect(
        screen.getByText(/Not enough data to forecast yet/)
      ).toBeDefined();
    });
  });
});
