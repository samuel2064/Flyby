import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TestBrowserRouter } from "./testRouter";
import Dashboard from "../src/pages/Dashboard";

const mockDashboardData = {
  data: {
    summary: {
      totalCheckpoints: 2,
      totalReports: 150,
      avgAccuracy: 85,
      generationSuccessRate: 92,
      avgProcessingTime: 18,
    },
    accuracyHistory: [
      { hour: "0:00", accuracy: 80 },
      { hour: "1:00", accuracy: 85 },
      { hour: "2:00", accuracy: 90 },
    ],
    checkpoints: [
      {
        id: "cp-1",
        name: "Terminal 1 Checkpoint A",
        code: "T1-A",
        terminal: "1",
        airportCode: "JFK",
        airportName: "John F. Kennedy International Airport",
        accuracy: 88,
        estimatedWaitTimeMinutes: 15,
        latestWaitTimeMinutes: 12,
        latestReportedAt: new Date().toISOString(),
        source: "crowd",
        totalReports: 45,
      },
      {
        id: "cp-2",
        name: "Terminal 2 Checkpoint B",
        code: "T2-B",
        terminal: "2",
        airportCode: "LGA",
        airportName: "LaGuardia Airport",
        accuracy: 72,
        estimatedWaitTimeMinutes: null,
        latestWaitTimeMinutes: null,
        latestReportedAt: null,
        source: null,
        totalReports: 12,
      },
    ],
  },
};

const mockDashboardDataEmptyHistory = {
  data: {
    summary: {
      totalCheckpoints: 0,
      totalReports: 0,
      avgAccuracy: 0,
      generationSuccessRate: 0,
      avgProcessingTime: 0,
    },
    accuracyHistory: [],
    checkpoints: [],
  },
};

const mockDashboardDataLowAccuracy = {
  data: {
    summary: {
      totalCheckpoints: 2,
      totalReports: 50,
      avgAccuracy: 35,
      generationSuccessRate: 80,
      avgProcessingTime: 25,
    },
    accuracyHistory: [
      { hour: "0:00", accuracy: 30 },
      { hour: "1:00", accuracy: 45 },
    ],
    checkpoints: [
      {
        id: "cp-low-1",
        name: "Low Accuracy Checkpoint",
        code: "LOW-1",
        terminal: null,
        airportCode: "TEST",
        airportName: "Test Airport",
        accuracy: 35,
        estimatedWaitTimeMinutes: 45,
        latestWaitTimeMinutes: 50,
        latestReportedAt: new Date().toISOString(),
        source: "pattern",
        totalReports: 10,
      },
      {
        id: "cp-low-2",
        name: "Medium Accuracy Checkpoint",
        code: "MED-1",
        terminal: "A",
        airportCode: "TEST",
        airportName: "Test Airport",
        accuracy: 55,
        estimatedWaitTimeMinutes: 20,
        latestWaitTimeMinutes: 18,
        latestReportedAt: new Date().toISOString(),
        source: "crowd",
        totalReports: 40,
      },
    ],
  },
};

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders skeleton loading state", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => new Promise(() => {}));
    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );
    await waitFor(() => {
      const skeletonCards = document.querySelectorAll(".animate-pulse");
      expect(skeletonCards.length).toBeGreaterThan(0);
    });
  });

  it("renders summary cards with metrics", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardData),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("85%")).toBeDefined();
      expect(screen.getByText("92%")).toBeDefined();
      expect(screen.getByText("150")).toBeDefined();
      expect(screen.getByText("18 min")).toBeDefined();
    });
  });

  it("renders accuracy section heading", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardData),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Accuracy Metrics Dashboard")).toBeDefined();
    });
  });

  it("renders per-checkpoint breakdown table", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardData),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Terminal 1 Checkpoint A")).toBeDefined();
      expect(screen.getByText("Terminal 2 Checkpoint B")).toBeDefined();
      expect(screen.getByText("88%")).toBeDefined();
      expect(screen.getByText("72%")).toBeDefined();
    });
  });

  it("shows 'no data' when dashboard data is null", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ data: null }),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("No dashboard data available.")).toBeDefined();
    });
  });

  it("displays table column headers", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardData),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Airport")).toBeDefined();
      expect(screen.getByText("Checkpoint")).toBeDefined();
      expect(screen.getByText("Terminal")).toBeDefined();
      expect(screen.getByText("Accuracy")).toBeDefined();
      expect(screen.getByText("Est. Wait")).toBeDefined();
      expect(screen.getByText("Reports")).toBeDefined();
    });
  });

  it("displays error message when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to load dashboard.")).toBeDefined();
    });
  });

  it("handles empty accuracyHistory with fallback data", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardDataEmptyHistory),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Accuracy Metrics Dashboard")).toBeDefined();
      expect(screen.getByText("Accuracy Score Over Time")).toBeDefined();
    });
  });

  it("handles empty checkpoints with fallback data", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardDataEmptyHistory),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Processing Time per Checkpoint")).toBeDefined();
      expect(screen.getByText("Per-Checkpoint Breakdown")).toBeDefined();
    });
  });

  it("renders red accuracy color for low accuracy (< 40)", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardDataLowAccuracy),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      // Find the 35% in the table (not the summary card)
      const tableCell = screen.getByText("Low Accuracy Checkpoint").closest("tr")?.querySelector("td:nth-child(4)");
      expect(tableCell).toBeDefined();
      expect(tableCell).toHaveClass("text-red-600");
    });
  });

  it("renders yellow accuracy color for medium accuracy (40-69)", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardDataLowAccuracy),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      // Find the 55% in the table (not the summary card)
      const tableCell = screen.getByText("Medium Accuracy Checkpoint").closest("tr")?.querySelector("td:nth-child(4)");
      expect(tableCell).toBeDefined();
      expect(tableCell).toHaveClass("text-yellow-600");
    });
  });

  it("renders green accuracy color for high accuracy (>= 70)", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardData),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      // Find the 88% in the table (first checkpoint)
      const tableCell = screen.getByText("Terminal 1 Checkpoint A").closest("tr")?.querySelector("td:nth-child(4)");
      expect(tableCell).toBeDefined();
      expect(tableCell).toHaveClass("text-green-600");
    });
  });

  it("shows terminal fallback em dash when terminal is null", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardDataLowAccuracy),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("—")).toBeDefined();
    });
  });

  it("shows estimated wait time fallback em dash when null", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(mockDashboardData),
      })
    );

    render(
      <TestBrowserRouter>
        <Dashboard />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("—")).toBeDefined();
    });
  });
});
