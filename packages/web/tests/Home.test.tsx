import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TestBrowserRouter } from "./testRouter";
import Home from "../src/pages/Home";

let mockEventSource: any;
let onlineHandler: Function | null = null;
let offlineHandler: Function | null = null;

function createMockCheckpoint(overrides: Partial<any> = {}) {
  return {
    id: "cp-1",
    airportCode: "JFK",
    airportName: "John F. Kennedy International Airport",
    code: "T1-A",
    name: "Terminal 1 Checkpoint A",
    terminal: "1",
    latestWaitTimeMinutes: 12,
    latestReportedAt: new Date().toISOString(),
    source: "crowd",
    ...overrides,
  };
}

function mockFetch(data: any, ok = true) {
  vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? "OK" : "Error",
      json: () => Promise.resolve(ok ? { data } : { error: "Failed" }),
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  onlineHandler = null;
  offlineHandler = null;

  mockEventSource = {
    onmessage: null,
    onopen: null,
    onerror: null,
    close: vi.fn(),
  };

  vi.stubGlobal('EventSource', function() { return mockEventSource; });

  vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
    if (event === 'online') onlineHandler = handler as Function;
    if (event === 'offline') offlineHandler = handler as Function;
  });
});

describe("Home page", () => {
  it("renders skeleton loading state", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => new Promise(() => {}));
    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );
    await act(async () => {});
    const skeletonCards = document.querySelectorAll(".animate-pulse");
    expect(skeletonCards.length).toBeGreaterThan(0);
  });

  it("renders checkpoints", async () => {
    mockFetch([createMockCheckpoint()]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("airport-header-JFK")).toBeDefined();
    }, { timeout: 3000 });

    expect(screen.getByText("John F. Kennedy International Airport")).toBeDefined();
  });

  it("displays error state when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Error",
        json: () => Promise.resolve({ error: "Server error" }),
      })
    );

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeDefined();
    }, { timeout: 3000 });
  });

  it("shows empty state when no checkpoints returned", async () => {
    mockFetch([]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("No checkpoints found")).toBeDefined();
    }, { timeout: 3000 });
  });

  it("filters by search query", async () => {
    mockFetch([
      createMockCheckpoint({ airportCode: "JFK", airportName: "John F. Kennedy" }),
      createMockCheckpoint({ id: "cp-2", airportCode: "LGA", airportName: "LaGuardia", name: "Terminal B Checkpoint", terminal: "B" }),
    ]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("airport-header-JFK")).toBeDefined();
    }, { timeout: 3000 });

    const searchInput = screen.getByTestId("home-search");
    fireEvent.change(searchInput, { target: { value: "LGA" } });

    await waitFor(() => {
      expect(screen.getByTestId("airport-header-LGA")).toBeDefined();
    });
    expect(screen.queryByTestId("airport-header-JFK")).toBeNull();
  });

  it("shows no results message when filter matches nothing", async () => {
    mockFetch([
      createMockCheckpoint(),
      createMockCheckpoint({ id: "cp-2", airportCode: "LGA", airportName: "LaGuardia", name: "Terminal B", terminal: "B" }),
    ]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("airport-header-JFK")).toBeDefined();
    }, { timeout: 3000 });

    const searchInput = screen.getByTestId("home-search");
    fireEvent.change(searchInput, { target: { value: "ZZZ" } });

    await waitFor(() => {
      expect(screen.getByText("No checkpoints found")).toBeDefined();
    });
  });

  it("expands and collapses airport checkpoint list", async () => {
    mockFetch([createMockCheckpoint()]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("airport-header-JFK")).toBeDefined();
    }, { timeout: 3000 });

    expect(screen.queryByTestId("airport-checkpoints-JFK")).toBeNull();

    fireEvent.click(screen.getByTestId("airport-header-JFK"));
    expect(screen.getByTestId("airport-checkpoints-JFK")).toBeDefined();

    fireEvent.click(screen.getByTestId("airport-header-JFK"));
    expect(screen.queryByTestId("airport-checkpoints-JFK")).toBeNull();
  });

  it("renders SSE live status when connected", async () => {
    mockFetch([createMockCheckpoint()]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(mockEventSource.onopen).not.toBeNull();
    });

    act(() => { mockEventSource.onopen(); });

    await waitFor(() => {
      expect(screen.getByTestId("sse-status")).toBeDefined();
      expect(screen.getByText("Live")).toBeDefined();
    }, { timeout: 3000 });
  });

  it("shows SSE connecting state by default", async () => {
    mockFetch([createMockCheckpoint()]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Connecting…")).toBeDefined();
    }, { timeout: 3000 });
  });

  it("shows polling fallback when SSE errors out", async () => {
    mockFetch([createMockCheckpoint()]);

    vi.stubGlobal('EventSource', function() {
      throw new Error('Connection failed');
    });

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Polling")).toBeDefined();
    }, { timeout: 3000 });
  });

  it("opens report modal when Report time is clicked", async () => {
    mockFetch([createMockCheckpoint()]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("airport-header-JFK")).toBeDefined();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByTestId("airport-header-JFK"));
    expect(screen.getByTestId("airport-checkpoints-JFK")).toBeDefined();

    const reportButton = screen.getByText("Report time");
    fireEvent.click(reportButton);

    expect(screen.getByText("Report Wait Time")).toBeDefined();
  });

  it("displays dash for null wait time", async () => {
    mockFetch([createMockCheckpoint({ latestWaitTimeMinutes: null })]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("airport-header-JFK")).toBeDefined();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByTestId("airport-header-JFK"));

    await waitFor(() => {
      expect(screen.getByText("—")).toBeDefined();
    }, { timeout: 3000 });
  });

  it("computes average wait time for airport groups", async () => {
    mockFetch([
      createMockCheckpoint({ id: "cp-1", airportCode: "JFK", latestWaitTimeMinutes: 10 }),
      createMockCheckpoint({ id: "cp-2", airportCode: "JFK", name: "Terminal 2", terminal: "2", latestWaitTimeMinutes: 20 }),
    ]);

    render(
      <TestBrowserRouter>
        <Home />
      </TestBrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Avg wait: 15 min/)).toBeDefined();
    }, { timeout: 3000 });
  });
});
