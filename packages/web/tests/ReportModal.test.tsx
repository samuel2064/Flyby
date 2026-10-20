import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReportModal from "../src/components/ReportModal";
import * as offlineQueueLib from "../src/lib/offlineQueue";

vi.mock("../src/lib/offlineQueue");

let offlineHandler: ((event: Event) => void) | null = null;

beforeEach(() => {
  vi.restoreAllMocks();
  offlineHandler = null;
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

  // Default mock: addReportToQueue succeeds
  vi.mocked(offlineQueueLib.addReportToQueue).mockResolvedValue({ success: true, deduped: false });

  vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
    if (event === 'offline') offlineHandler = handler as (event: Event) => void;
  });
  vi.spyOn(window, 'removeEventListener');
});

describe("ReportModal", () => {
  const defaultProps = {
    checkpointId: "cp-1",
    checkpointName: "Test Checkpoint",
    onClose: vi.fn(),
    onReported: vi.fn(),
  };

  it("renders the modal with checkpoint name", async () => {
    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });
    expect(screen.getByText("Report Wait Time")).toBeDefined();
    expect(screen.getByText("Test Checkpoint")).toBeDefined();
  });

  it("displays the slider with default value of 15", async () => {
    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });
    expect(screen.getByText("15 min")).toBeDefined();
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).not.toBeNull();
    expect(slider.value).toBe("15");
  });

  it("updates minute display when slider changes", async () => {
    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).not.toBeNull();

    fireEvent.change(slider, { target: { value: "45" } });
    expect(screen.getByText("45 min")).toBeDefined();
  });

  it("shows Submit button when online", async () => {
    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });
    expect(screen.getByText("Submit")).toBeDefined();
  });

  it("shows Queue Report button when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });
    expect(screen.getByText("Queue Report")).toBeDefined();
  });

  it("shows Offline Queued badge when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });
    expect(screen.getByText("Offline Queued")).toBeDefined();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<ReportModal {...defaultProps} onClose={onClose} />);
    });

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows loading state during submission", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    fireEvent.click(screen.getByText("Submit"));
    expect(screen.getByText("Submitting...")).toBeDefined();
  });

  it("shows success message after successful submit", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      status: 201,
      statusText: "Created",
      json: async () => ({ data: { id: "wt-1" } }),
    });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
    });

    await waitFor(() => {
      expect(screen.getByText("Thanks for reporting!")).toBeDefined();
    });
  });

  it("shows error message when submit fails", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockRejectedValueOnce(new Error("Network error"));

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to submit. Please try again.")).toBeDefined();
    });
  });

  it("handles rate limit response with retry-after header", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      status: 429,
      headers: new Map([["Retry-After", "30"]]),
      json: async () => ({ error: "Rate limited", retryAfter: 30 }),
      ok: false,
    });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Please wait 30 seconds/)).toBeDefined();
    });
  });

  it("handles rate limit with retryAfter in response body", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      status: 429,
      headers: new Map(),
      json: async () => ({ error: "Rate limited", retryAfter: 15 }),
      ok: false,
    });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Please wait 15 seconds/)).toBeDefined();
    });
  });

  it("counts down retry timer", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      status: 429,
      headers: new Map([["Retry-After", "3"]]),
      json: async () => ({ error: "Rate limited", retryAfter: 3 }),
      ok: false,
    });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Please wait 3 seconds/)).toBeDefined();
    });

    // Wait for countdown to progress
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(screen.getByText(/Please wait 2 seconds/)).toBeDefined();
    
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(screen.getByText(/Please wait 1 second/)).toBeDefined();
  });

  it("clears error when retry timer reaches zero", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      status: 429,
      headers: new Map([["Retry-After", "1"]]),
      json: async () => ({ error: "Rate limited", retryAfter: 1 }),
      ok: false,
    });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Please wait 1 second/)).toBeDefined();
    });

    // Wait for timer to reach zero
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100));
    });
    
    // Error should be cleared
    expect(screen.queryByText(/Please wait/)).toBeNull();
  });

  it("queues report when offline and shows success", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => Promise.resolve());

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Queue Report"));
    });

    await waitFor(() => {
      expect(screen.getByText("Report queued - will sync when online")).toBeDefined();
    });
  });

  it("shows pending count message when offline and reports are queued", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    expect(screen.getByText(/You're offline/)).toBeDefined();
  });

  it("disables submit button during loading", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    const submitButton = screen.getByText("Submit").closest("button");
    expect(submitButton?.disabled).toBe(false);

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Submitting...").closest("button")?.disabled).toBe(true);
    });
  });

  it("queues report on API failure and shows success", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => ({ error: "Server error" }),
    });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
    });

    await waitFor(() => {
      expect(screen.getByText("Thanks for reporting!")).toBeDefined();
    });
  });

  it("shows error when offline queueing fails", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    // Mock queueReport to return false (failure)
    vi.mocked(offlineQueueLib.addReportToQueue).mockResolvedValue({ success: false, deduped: false });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Queue Report"));
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to queue report. Please try again.")).toBeDefined();
    });
  });

  it("shows error when API fails and offline queue also fails", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => ({ error: "Server error" }),
    });

    // Mock queueReport to return false (failure)
    vi.mocked(offlineQueueLib.addReportToQueue).mockResolvedValue({ success: false, deduped: false });

    await act(async () => {
      render(<ReportModal {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Submit"));
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to submit. Please try again.")).toBeDefined();
    });
  });
});
