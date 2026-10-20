import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NotifyToggle from "../src/components/NotifyToggle";

// Mock usePushNotification so we can drive the toggle's behaviour deterministically.
const mockHook = vi.fn();

vi.mock("../src/hooks/usePushNotification", () => ({
  usePushNotification: (...args: any[]) => mockHook(...args),
}));

function renderToggle(props: { airportId: string; airportCode: string }) {
  return render(<NotifyToggle {...props} />);
}

function setHookReturnValue(overrides: Partial<{
  isSupported: boolean;
  hasPermission: boolean;
  loading: boolean;
  error: string | null;
  subscription: PushSubscription | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  requestPermission: () => Promise<boolean>;
}> = {}) {
  mockHook.mockReturnValue({
    isSupported: true,
    hasPermission: false,
    loading: false,
    error: null,
    subscription: null,
    subscribe: vi.fn().mockResolvedValue(true),
    unsubscribe: vi.fn().mockResolvedValue(true),
    requestPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  });
}

describe("NotifyToggle", () => {
  beforeEach(() => {
    mockHook.mockReset();
    setHookReturnValue();
    // jsdom does not implement localStorage fully in all envs; ensure clean state.
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Notify me' when supported and not yet active", () => {
    renderToggle({ airportId: "a1", airportCode: "JFK" });
    expect(screen.getByTestId("notify-toggle")).toBeDefined();
    expect(screen.getByText("Notify me")).toBeDefined();
  });

  it("renders 'Notify unavailable' when push is not supported", () => {
    setHookReturnValue({ isSupported: false });
    renderToggle({ airportId: "a1", airportCode: "JFK" });
    expect(screen.getByText("Notify unavailable")).toBeDefined();
  });

  it("shows loading indicator ('…') and disables the button while loading", () => {
    setHookReturnValue({ loading: true });
    renderToggle({ airportId: "a1", airportCode: "JFK" });
    const button = screen.getByTestId("notify-toggle") as HTMLButtonElement;
    expect(button.textContent).toContain("…");
    expect(button.disabled).toBe(true);
  });

  it("displays an error message when present", () => {
    setHookReturnValue({ error: "VAPID fetch failed" });
    renderToggle({ airportId: "a1", airportCode: "JFK" });
    expect(screen.getByText("VAPID fetch failed")).toBeDefined();
  });

  it("enabling requests permission (when not granted) then subscribes", async () => {
    const subscribe = vi.fn().mockResolvedValue(true);
    const requestPermission = vi.fn().mockResolvedValue(true);
    setHookReturnValue({ hasPermission: false, subscribe, requestPermission });
    renderToggle({ airportId: "a1", airportCode: "JFK" });

    const button = screen.getByTestId("notify-toggle");
    fireEvent.click(button);

    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    expect(subscribe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("Notify on")).toBeDefined());
    expect(window.localStorage.getItem("flyby:notify:a1")).toBe("1");
  });

  it("enabling skips permission request when already granted", async () => {
    const subscribe = vi.fn().mockResolvedValue(true);
    const requestPermission = vi.fn().mockResolvedValue(true);
    setHookReturnValue({ hasPermission: true, subscribe, requestPermission });
    renderToggle({ airportId: "a1", airportCode: "JFK" });

    fireEvent.click(screen.getByTestId("notify-toggle"));

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    expect(requestPermission).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Notify on")).toBeDefined());
  });

  it("does not enable when subscription fails", async () => {
    const subscribe = vi.fn().mockResolvedValue(false);
    setHookReturnValue({ hasPermission: true, subscribe });
    renderToggle({ airportId: "a1", airportCode: "JFK" });

    fireEvent.click(screen.getByTestId("notify-toggle"));

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    // Should remain in the "Notify me" (off) state
    expect(screen.getByText("Notify me")).toBeDefined();
    expect(window.localStorage.getItem("flyby:notify:a1")).toBeNull();
  });

  it("disabling calls unsubscribe and clears persistent state", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    setHookReturnValue({ hasPermission: true, subscription: {} as PushSubscription, unsubscribe });
    window.localStorage.setItem("flyby:notify:a1", "1");

    renderToggle({ airportId: "a1", airportCode: "JFK" });
    // Initial state reflects persisted "enabled" and existing subscription
    expect(screen.getByText("Notify on")).toBeDefined();

    fireEvent.click(screen.getByTestId("notify-toggle"));

    await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Notify me")).toBeDefined());
    expect(window.localStorage.getItem("flyby:notify:a1")).toBe("0");
  });

  it("does not turn off if unsubscribe fails", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(false);
    setHookReturnValue({ hasPermission: true, subscription: {} as PushSubscription, unsubscribe });
    window.localStorage.setItem("flyby:notify:a1", "1");

    renderToggle({ airportId: "a1", airportCode: "JFK" });
    fireEvent.click(screen.getByTestId("notify-toggle"));

    await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Notify on")).toBeDefined();
    expect(window.localStorage.getItem("flyby:notify:a1")).toBe("1");
  });

  it("does not toggle when unsupported", async () => {
    setHookReturnValue({ isSupported: false });
    renderToggle({ airportId: "a1", airportCode: "JFK" });
    // No clickable toggle rendered — "Notify unavailable" label is present instead.
    expect(screen.queryByTestId("notify-toggle")).toBeNull();
  });

  it("restores enabled state from localStorage on mount", () => {
    window.localStorage.setItem("flyby:notify:a1", "1");
    setHookReturnValue({ hasPermission: true, subscription: {} as PushSubscription });
    renderToggle({ airportId: "a1", airportCode: "JFK" });
    expect(screen.getByText("Notify on")).toBeDefined();
  });

  it("respects aria-checked role attribute on toggle", () => {
    renderToggle({ airportId: "a1", airportCode: "JFK" });
    const button = screen.getByTestId("notify-toggle");
    expect(button.getAttribute("role")).toBe("switch");
    expect(button.getAttribute("aria-checked")).toBe("false");
  });
});
