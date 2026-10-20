import React, { useState, useEffect } from "react";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { apiUrl } from "../lib/apiUrl";

interface ReportModalProps {
  checkpointId: string;
  checkpointName: string;
  onClose: () => void;
  onReported: () => void;
}

export default function ReportModal({ checkpointId, checkpointName, onClose, onReported }: ReportModalProps) {
  const [minutes, setMinutes] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const { isOnline, queueReport, pendingCount } = useOfflineQueue();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRetryAfter(null);

    // If offline, queue immediately without trying to fetch
    if (!isOnline) {
      try {
        const queued = await queueReport(checkpointId, minutes, "crowd");
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
        body: JSON.stringify({ minutes, source: "crowd", reportedAt: new Date().toISOString() }),
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
        const queued = await queueReport(checkpointId, minutes, "crowd");
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
              <input
                type="range"
                min={0}
                max={120}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-center text-3xl font-bold text-brand mt-2">{minutes} min</div>
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
