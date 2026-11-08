import React, { useState, useEffect } from "react";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { apiUrl } from "../lib/apiUrl";
import { LANE_TYPES, type LaneType } from "../lib/lane";

interface ReportModalProps {
  checkpointId: string;
  checkpointName: string;
  onClose: () => void;
  onReported: () => void;
}

const WAIT_OPTIONS: number[] = [5, 10, 15, 20, 30, 45, 60];

// Traveler-facing label per stored lane value; "standard" reads as "Standard".
const LANE_BUTTON_LABELS: Record<LaneType, string> = {
  standard: "Standard",
  preclear: "TSA PreCheck",
  clear: "CLEAR",
};

export default function ReportModal({ checkpointId, checkpointName, onClose, onReported }: ReportModalProps) {
  const [minutes, setMinutes] = useState(WAIT_OPTIONS[2]);
  const [lane, setLane] = useState<LaneType>("standard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const { isOnline, queueReport, pendingCount } = useOfflineQueue();

  const selectMinutes = (value: number) => {
    setMinutes(value);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRetryAfter(null);

    // If offline, queue immediately without trying to fetch
    if (!isOnline) {
      try {
        const queued = await queueReport(checkpointId, minutes, "crowd", lane !== "standard" ? lane : undefined);
        if (queued) {
          setSuccess(true);
          setTimeout(() => {
            onReported();
            onClose();
          }, 1500);
          return;
        }
        throw new Error("Failed to queue report");
      } catch {
        setError("Failed to queue report. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/checkpoints/${checkpointId}/wait-times`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Standard stays off the wire (deploy-era default); expedited lanes are
        // the signal worth persisting (TIR-367).
        body: JSON.stringify({
          minutes,
          source: "crowd",
          ...(lane !== "standard" ? { reportType: lane } : {}),
          reportedAt: new Date().toISOString(),
        }),
      });

      if (res.status === 429) {
        const retrySec = res.headers.get("Retry-After")
          ? (() => {
              const parsed = parseInt(res.headers.get("Retry-After") || "", 10);
              return isNaN(parsed) ? 30 : parsed;
            })()
          : (await res.json().catch(() => ({ retryAfter: 30 }))).retryAfter || 30;
        setRetryAfter(retrySec);
        setError(`Please wait ${retrySec} seconds before reporting again`);
        setLoading(false);
        return;
      }
      
      if (!res.ok) {
        const queued = await queueReport(checkpointId, minutes, "crowd", lane !== "standard" ? lane : undefined);
        if (queued) {
          setSuccess(true);
          setTimeout(() => {
            onReported();
            onClose();
          }, 1500);
          return;
        }
        throw new Error("Failed to report");
      }
      
setSuccess(true);
      setTimeout(() => {
        onReported();
        onClose();
      }, 1500);
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Countdown for rate limit
  useEffect(() => {
    if (retryAfter === null || retryAfter <= 0) return;
    const timer = setInterval(() => {
      setRetryAfter((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          setError(null);
          return null;
        }
        setError(`Please wait ${prev - 1} seconds before reporting again`);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">Report Wait Time</h3>
          {!isOnline && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Offline Queued
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">{checkpointName}</p>

        {success ? (
          <div className="text-center text-green-600 font-semibold py-4">
            {isOnline ? "Thanks for reporting!" : "Report queued - will sync when online"}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Wait time (minutes)</label>
              <div className="grid grid-cols-4 gap-2">
                {WAIT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => selectMinutes(option)}
                    aria-pressed={minutes === option}
                    className={`h-12 rounded-xl border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
                      minutes === option
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {option === 60 ? "60+" : option}
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-gray-500 mt-1">
                {minutes} min
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Which lane?</label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Lane type">
                {LANE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={lane === type}
                    onClick={() => setLane(type)}
                    className={`h-11 rounded-xl border text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
                      lane === type
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {LANE_BUTTON_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            
            {!isOnline && (
              <p className="text-xs text-gray-500">
                You're offline. Your report will be saved and submitted when you're back online.
                {pendingCount > 0 && ` (${pendingCount} report${pendingCount === 1 ? '' : 's'} pending)`}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-brand text-white font-semibold hover:bg-brandDark disabled:opacity-50"
              >
                {loading ? "Submitting..." : isOnline ? "Submit" : "Queue Report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
