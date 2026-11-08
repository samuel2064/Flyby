import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestBrowserRouter, TestMemoryRouter } from "./testRouter";
import { AuthProvider } from "../src/contexts/AuthContext";
import App from "../src/App";

// App renders the global shell (header + routes + footer). No route data is
// needed for footer assertions: the footer sits outside <Routes>, so it mounts
// even while the dashboard fetch is pending.
function renderApp(initialEntries?: string[]) {
  return render(
    <TestBrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </TestBrowserRouter>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  // App mounts the PublicDashboard on "/" whose fetch may resolve before the
  // assertion runs; stub fetch as pending and stub EventSource (used by the
  // live-status hook) so the shell renders deterministically.
  vi.spyOn(globalThis, "fetch" as any).mockImplementation(
    () => new Promise(() => {})
  );
  vi.stubGlobal("EventSource", function () {
    return { onmessage: null, onopen: null, onerror: null, close: vi.fn() };
  });
});

describe("App global footer (TIR-366)", () => {
  it("renders the footer on the home route", () => {
    renderApp();
    const footer = screen.getByTestId("app-footer");
    expect(footer).toBeDefined();
    expect(
      screen.getByText("Flyby — crowdsourced airport security wait times")
    ).toBeDefined();
  });

  it("uses a semantic <footer> element", () => {
    const { container } = renderApp();
    expect(container.querySelector("footer")).not.toBeNull();
  });

  it("keeps the AA-contrast text class (TIR-308: slate-500, not slate-400)", () => {
    renderApp();
    const footer = screen.getByTestId("app-footer");
    expect(footer.className).toContain("text-slate-500");
    expect(footer.className).not.toContain("text-slate-400");
  });

  it("renders the footer on a non-home route too (global shell)", () => {
    render(
      <TestMemoryRouter initialEntries={["/search"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </TestMemoryRouter>
    );
    expect(screen.getByTestId("app-footer")).toBeDefined();
  });
});
