import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestBrowserRouter } from "./testRouter";
import Profile from "../src/pages/Profile";
import { useAuth } from "../src/contexts/AuthContext";
import { useApi } from "../src/hooks/useApi";
import { useApiMutation } from "../src/hooks/useApiMutation";

vi.mock("../src/contexts/AuthContext");
vi.mock("../src/hooks/useApi");
vi.mock("../src/hooks/useApiMutation");

const PREFS_URL = "/api/notifications/preferences";
const PREFS_DEFAULT = {
  dndEnabled: false,
  dndStartHour: 22,
  dndEndHour: 6,
  thresholdMinutes: 30,
  spikePercent: 100,
};

/**
 * Default per-URL useApi implementation. Profile calls useApi for reports and
 * the embedded NotificationPreferences component calls it for /preferences.
 * Tests pass a `reports` shape for /reports; prefs always resolves to a sane
 * default (clean state) so the reports-view assertions dominate.
 */
function mockUseApi(reportsState: { data: any; loading?: boolean; error?: string | null }) {
  // @ts-expect-error mock implementation
  useApi.mockImplementation((url: string) => {
    if (url === PREFS_URL) {
      return { data: PREFS_DEFAULT, loading: false, error: null, refetch: vi.fn() };
    }
    return {
      data: reportsState.data,
      loading: reportsState.loading ?? false,
      error: reportsState.error ?? null,
      refetch: vi.fn(),
    };
  });
}

const renderProfile = () =>
  render(
    <TestBrowserRouter>
      <Profile />
    </TestBrowserRouter>
  );

beforeEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error mock implementation
  useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });
});

describe("Profile page", () => {
  it("shows login prompt when user is not authenticated", () => {
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: null });
    mockUseApi({ data: null });

    renderProfile();

    expect(screen.getByText("Please log in to view your profile.")).toBeTruthy();
    const loginLink = screen.getByText("Go to login");
    expect(loginLink).toBeTruthy();
    expect(loginLink.closest("a")?.getAttribute("href")).toBe("/login");
  });

  it("displays user profile information when authenticated", () => {
    const mockUser = { displayName: "Test User", email: "test@example.com" };
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: mockUser });
    mockUseApi({ data: [] });

    renderProfile();

    expect(screen.getByText("Test User")).toBeTruthy();
    expect(screen.getByText("test@example.com")).toBeTruthy();
  });

  it("shows default 'Traveler' name when user has no displayName", () => {
    const mockUser = { displayName: null, email: "test@example.com" };
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: mockUser });
    mockUseApi({ data: [] });

    renderProfile();

    expect(screen.getByText("Traveler")).toBeTruthy();
    expect(screen.getByText("test@example.com")).toBeTruthy();
  });

  it("displays loading skeleton when reports are loading", () => {
    const mockUser = { displayName: "Test User", email: "test@example.com" };
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: mockUser });
    // Reports loading true; prefs normal so NotifyPrefs skeleton doesn't crash.
    // @ts-expect-error: mock implementation
    useApi.mockImplementation((url: string) => {
      if (url === PREFS_URL) {
        return { data: PREFS_DEFAULT, loading: false, error: null, refetch: vi.fn() };
      }
      return { data: null, loading: true, error: null, refetch: vi.fn() };
    });

    renderProfile();

    expect(screen.getByText("Your Reports")).toBeTruthy();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("displays error message when reports fail to load", () => {
    const mockUser = { displayName: "Test User", email: "test@example.com" };
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: mockUser });
    mockUseApi({ data: null, error: "Failed to load" });

    renderProfile();

    expect(screen.getByText("Failed to load")).toBeTruthy();
  });

  it("shows 'no reports' message when user has no reports", () => {
    const mockUser = { displayName: "Test User", email: "test@example.com" };
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: mockUser });
    mockUseApi({ data: [] });

    renderProfile();

    expect(screen.getByText("No reports yet.")).toBeTruthy();
    const submitLink = screen.getByText("Submit your first report!");
    expect(submitLink).toBeTruthy();
    expect(submitLink.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("renders list of reports when user has reports", () => {
    const mockUser = { displayName: "Test User", email: "test@example.com" };
    const mockReports = [
      {
        id: "1",
        minutes: 25,
        createdAt: "2026-06-01T10:00:00Z",
        checkpoint: {
          name: "Terminal A Security",
          airport: { code: "JFK", city: "New York" },
        },
      },
      {
        id: "2",
        minutes: 15,
        createdAt: "2026-06-05T14:30:00Z",
        checkpoint: {
          name: "Terminal B Security",
          airport: { code: "LAX", city: "Los Angeles" },
        },
      },
    ];
    // @ts-expect-error: mock implementation
    useAuth.mockReturnValue({ user: mockUser });
    mockUseApi({ data: mockReports });

    renderProfile();

    expect(screen.getByText("Terminal A Security")).toBeTruthy();
    expect(screen.getByText("New York (JFK)")).toBeTruthy();
    expect(screen.getByText("25 min")).toBeTruthy();

    expect(screen.getByText("Terminal B Security")).toBeTruthy();
    expect(screen.getByText("Los Angeles (LAX)")).toBeTruthy();
    expect(screen.getByText("15 min")).toBeTruthy();

    expect(screen.getByText("2026-06-01")).toBeTruthy();
    expect(screen.getByText("2026-06-05")).toBeTruthy();
  });
});
