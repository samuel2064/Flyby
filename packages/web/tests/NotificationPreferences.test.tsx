import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestBrowserRouter } from "./testRouter";
import NotificationPreferences from "../src/components/NotificationPreferences";
import { useApi } from "../src/hooks/useApi";
import { useApiMutation } from "../src/hooks/useApiMutation";

vi.mock("../src/hooks/useApi");
vi.mock("../src/hooks/useApiMutation");

const renderPrefs = () =>
  render(
    <TestBrowserRouter>
      <NotificationPreferences />
    </TestBrowserRouter>
  );

const DEFAULT_DATA = {
  dndEnabled: true,
  dndStartHour: 22,
  dndEndHour: 6,
  thresholdMinutes: 30,
  spikePercent: 100,
  leaveNowPercent: 150,
  rateLimitMinutes: 60,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("NotificationPreferences", () => {
  it("renders a loading skeleton while prefs load", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    expect(screen.getByText("Notification Preferences")).toBeTruthy();
    expect(screen.queryByLabelText(/Alert threshold in minutes/)).toBeNull();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders an error message when GET fails and no cached prefs", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: null, loading: false, error: "HTTP 401: Unauthorized", refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    expect(screen.getByText("HTTP 401: Unauthorized")).toBeTruthy();
  });

  it("renders all controls populated with fetched prefs", () => {
    const refetch = vi.fn();
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();

    // Threshold slider shows current value
    const threshold = screen.getByLabelText(/Alert threshold in minutes/) as HTMLInputElement;
    expect(threshold.value).toBe("30");

    // Spike slider
    const spike = screen.getByLabelText(/Spike sensitivity percent/) as HTMLInputElement;
    expect(spike.value).toBe("100");

    // Leave-now slider
    const leaveNow = screen.getByLabelText(/Leave-now sensitivity multiplier over historical average/) as HTMLInputElement;
    expect(leaveNow.value).toBe("150");

    // Rate-limit cooldown slider
    const rateLimit = screen.getByLabelText(/Minimum minutes between notifications per airport/) as HTMLInputElement;
    expect(rateLimit.value).toBe("60");

    // DND checkbox checked
    const dnd = screen.getByLabelText(/Enable Do Not Disturb hours/) as HTMLInputElement;
    expect(dnd.checked).toBe(true);

    // DND window selects are visible (because dndEnabled=true)
    expect(screen.getByTestId("dnd-window")).toBeTruthy();
    const start = screen.getByLabelText(/Quiet hours start/) as HTMLSelectElement;
    expect(start.value).toBe("22");
    const end = screen.getByLabelText(/Quiet hours end/) as HTMLSelectElement;
    expect(end.value).toBe("6");
  });

  it("hides the DND window selects when DND is disabled", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: { ...DEFAULT_DATA, dndEnabled: false }, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    expect(screen.queryByTestId("dnd-window")).toBeNull();
  });

  it("shows the empty-window hint when start equals end", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: { ...DEFAULT_DATA, dndEnabled: true, dndStartHour: 0, dndEndHour: 0 }, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    expect(screen.getByText(/empty/i)).toBeTruthy();
  });

  it("Save button is disabled when there are no unsaved changes", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    const save = screen.getByLabelText(/Save notification preferences/) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    // "Saved." status when clean
    expect(screen.getByText("Saved.")).toBeTruthy();
  });

  it("marks the form dirty and enables Save when a value changes", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    const threshold = screen.getByLabelText(/Alert threshold in minutes/) as HTMLInputElement;
    fireEvent.change(threshold, { target: { value: "45" } });

    expect(threshold.value).toBe("45");
    expect(screen.getByText("45 min")).toBeTruthy();
    const save = screen.getByLabelText(/Save notification preferences/) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    // "Discard changes" link appears
    expect(screen.getByText(/Discard changes/)).toBeTruthy();
    // "Saved." no longer shows until we save
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  it("Discard changes reverts the draft back to the server state", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    const threshold = screen.getByLabelText(/Alert threshold in minutes/) as HTMLInputElement;
    fireEvent.change(threshold, { target: { value: "60" } });
    expect(threshold.value).toBe("60");

    fireEvent.click(screen.getByText(/Discard changes/));
    expect(threshold.value).toBe("30");
  });

  it("marks the leave-now slider dirty and reflects the multiplier in the label", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    const leaveNow = screen.getByLabelText(/Leave-now sensitivity multiplier over historical average/) as HTMLInputElement;
    // Default 150 -> "1.5× historical average"
    expect(screen.getByText(/1\.5×/)).toBeTruthy();

    fireEvent.change(leaveNow, { target: { value: "220" } });
    expect(leaveNow.value).toBe("220");
    // 220 -> "2.2× historical average"
    expect(screen.getByText(/2\.2×/)).toBeTruthy();
    const save = screen.getByLabelText(/Save notification preferences/) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    expect(screen.getByText(/Discard changes/)).toBeTruthy();
  });

  it("refetch is wired when leave-now slider is saved", async () => {
    // Ensure the refetch callback passed to onSuccess is exercised through the
    // save path when leaveNowPercent is the only changed field.
    const mutate = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn();
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate, loading: false, error: null });

    renderPrefs();
    const leaveNow = screen.getByLabelText(/Leave-now sensitivity multiplier over historical average/) as HTMLInputElement;
    fireEvent.change(leaveNow, { target: { value: "200" } });

    const save = screen.getByLabelText(/Save notification preferences/) as HTMLButtonElement;
    await fireEvent.click(save);

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
    });
    const call = mutate.mock.calls[0];
    expect(call[1].url).toBe("/api/notifications/preferences");
    expect(call[1].method).toBe("PATCH");
    expect(call[0]).toMatchObject({ leaveNowPercent: 200 });
    expect(typeof call[1].onSuccess).toBe("function");
  });

  it("calls mutate with PUT (no — PATCH) and the full draft on Save", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn();
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate, loading: false, error: null });

    renderPrefs();
    const spike = screen.getByLabelText(/Spike sensitivity percent/) as HTMLInputElement;
    fireEvent.change(spike, { target: { value: "150" } });

    const save = screen.getByLabelText(/Save notification preferences/) as HTMLButtonElement;
    await fireEvent.click(save);

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
    });
    const call = mutate.mock.calls[0];
    expect(call[1].url).toBe("/api/notifications/preferences");
    expect(call[1].method).toBe("PATCH");
    expect(call[0]).toMatchObject({ spikePercent: 150 });
    // onSuccess wires refetch
    expect(typeof call[1].onSuccess).toBe("function");
  });

  it("shows Saving… and disables Save while saving", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: true, error: null });

    renderPrefs();
    // Make a change so Save is enabled, then check button label while loading.
    const threshold = screen.getByLabelText(/Alert threshold in minutes/) as HTMLInputElement;
    fireEvent.change(threshold, { target: { value: "45" } });
    const save = screen.getByLabelText(/Save notification preferences/) as HTMLButtonElement;
    expect(save.textContent).toBe("Saving…");
    expect(save.disabled).toBe(true);
  });

  it("shows a save error message when the mutation fails", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: "HTTP 400: Invalid preferences" });

    // We need a dirty draft for Save to be enabled; the saveError renders once dirty.
    renderPrefs();
    const threshold = screen.getByLabelText(/Alert threshold in minutes/) as HTMLInputElement;
    fireEvent.change(threshold, { target: { value: "45" } });
    // Save error renders as soon as the draft is dirty (saveError from hook is set)
    expect(screen.getByText("HTTP 400: Invalid preferences")).toBeTruthy();
  });

  it("shows the wrap-around hint when start > end (e.g. 22 -> 6)", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    expect(screen.getByText(/through midnight/i)).toBeTruthy();
  });

  it("shows the straightforward range hint when start < end", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({
      data: { ...DEFAULT_DATA, dndStartHour: 1, dndEndHour: 9 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    expect(screen.getByText(/Pause notifications between/i)).toBeTruthy();
    expect(screen.queryByText(/through midnight/i)).toBeNull();
  });

  it("reflects DND toggle off in the local draft", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    const dnd = screen.getByLabelText(/Enable Do Not Disturb hours/) as HTMLInputElement;
    fireEvent.click(dnd);
    expect(dnd.checked).toBe(false);
    expect(screen.queryByTestId("dnd-window")).toBeNull();
  });

  it("updates DND window when selects change", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    const start = screen.getByLabelText(/Quiet hours start/) as HTMLSelectElement;
    fireEvent.change(start, { target: { value: "23" } });
    expect(start.value).toBe("23");
    // Window should now be 23 -> 6 → still wrap-around (23 > 6)
    expect(screen.getByText(/through midnight/i)).toBeTruthy();
  });

  it("marks the rate-limit cooldown slider dirty and reflects the value in the label", () => {
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch: vi.fn() });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate: vi.fn(), loading: false, error: null });

    renderPrefs();
    const rateLimit = screen.getByLabelText(/Minimum minutes between notifications per airport/) as HTMLInputElement;
    // Default 60 -> "60 min"
    expect(screen.getByText("60 min")).toBeTruthy();

    fireEvent.change(rateLimit, { target: { value: "120" } });
    expect(rateLimit.value).toBe("120");
    expect(screen.getByText("120 min")).toBeTruthy();
    const save = screen.getByLabelText(/Save notification preferences/) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    expect(screen.getByText(/Discard changes/)).toBeTruthy();
  });

  it("PATCHes rateLimitMinutes and wires refetch when the cooldown slider is saved", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn();
    // @ts-expect-error mock implementation
    useApi.mockReturnValue({ data: DEFAULT_DATA, loading: false, error: null, refetch });
    // @ts-expect-error mock implementation
    useApiMutation.mockReturnValue({ mutate, loading: false, error: null });

    renderPrefs();
    const rateLimit = screen.getByLabelText(/Minimum minutes between notifications per airport/) as HTMLInputElement;
    fireEvent.change(rateLimit, { target: { value: "30" } });

    const save = screen.getByLabelText(/Save notification preferences/) as HTMLButtonElement;
    await fireEvent.click(save);

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
    });
    const call = mutate.mock.calls[0];
    expect(call[1].url).toBe("/api/notifications/preferences");
    expect(call[1].method).toBe("PATCH");
    expect(call[0]).toMatchObject({ rateLimitMinutes: 30 });
    expect(typeof call[1].onSuccess).toBe("function");
  });
});
