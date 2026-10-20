import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useSse } from "../hooks/useSse";
import { apiUrl } from "../lib/apiUrl";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { SkeletonCard, SkeletonText, SkeletonHeading } from "../components/Skeleton";
import ReportModal from "../components/ReportModal";
import NotifyToggle from "../components/NotifyToggle";

interface CheckpointView {
  id: string;
  code: string;
  name: string;
  terminal: string | null;
  latestWaitTimeMinutes: number | null;
  latestReportedAt: string | null;
  source: string | null;
}

interface AirportData {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string | null;
  country: string;
  checkpoints: CheckpointView[];
}

interface SseUpdate {
  checkpointId: string;
  minutes: number;
  source: string;
  reportedAt: string;
}

interface ForecastBestHour {
  hour: number;
  forecastFor: string;
  predictedMinutes: number;
}

interface CheckpointForecast {
  checkpointId: string;
  code: string;
  name: string;
  terminal: string | null;
  timezone: string;
  sampleCount: number;
  overallAverageMinutes: number | null;
  currentConsensusMinutes: number | null;
  liveConsensusMinutes: number | null;
  predictions: unknown[];
  bestHours: ForecastBestHour[];
}

interface AirportForecastsData {
  airportCode: string;
  airportName: string;
  timezone: string;
  historyDays: number;
  horizon: number;
  forecasts: CheckpointForecast[];
}

// Airport-local hour number (0-23) -> "2 PM" style label. Uses the API's
// airport-local hour directly so the chip is correct regardless of the
// viewer's own timezone.
function formatBestHour(hour: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? "AM" : "PM"}`;
}

// Per-checkpoint "best time today" chip. Enhances the card but must never
// break it: loading -> skeleton, no data / fetch error -> render nothing.
function BestTimeChip({ best, loading }: { best: ForecastBestHour | undefined; loading: boolean }) {
  if (loading) {
    return <div className="mt-1 h-4 w-24 rounded-full bg-gray-200 animate-pulse" aria-hidden="true" data-testid="best-time-skeleton" />;
  }
  if (!best) return null;
  return (
    <span
      className="mt-1 inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
      data-testid="best-time-chip"
      title="Quietest upcoming hour today, from crowd reports"
    >
      Best ~{formatBestHour(best.hour)} · {best.predictedMinutes} min
    </span>
  );
}

function getWaitColor(minutes: number | null) {
  if (minutes === null) return "text-gray-400";
  if (minutes <= 15) return "text-green-600";
  if (minutes <= 30) return "text-yellow-600";
  return "text-red-600";
}

function getWaitBg(minutes: number | null) {
  if (minutes === null) return "bg-gray-100";
  if (minutes <= 15) return "bg-green-50";
  if (minutes <= 30) return "bg-yellow-50";
  return "bg-red-50";
}

export default function Airport() {
  const { code } = useParams<{ code: string }>();
  const { data, loading, error, refetch } = useApi<AirportData>(
    code ? `/api/airports/${code.toUpperCase()}` : null,
    [code]
  );
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<{ id: string; name: string } | null>(null);
  const { isOnline, pendingCount, syncQueue } = useOfflineQueue();

  // Per-checkpoint pattern forecast (best time today) in one batch call
  const {
    data: forecastsData,
    loading: forecastsLoading,
    error: forecastsError,
    refetch: forecastsRefetch,
  } = useApi<AirportForecastsData>(
    code ? `/api/airports/${code.toUpperCase()}/forecasts` : null,
    [code]
  );

  // Map checkpointId -> best hour, guarded so a malformed response can never
  // crash the checkpoint cards.
  const bestByCheckpoint = new Map<string, ForecastBestHour>();
  if (!forecastsError && Array.isArray(forecastsData?.forecasts)) {
    for (const f of forecastsData.forecasts) {
      if (f?.checkpointId && Array.isArray(f.bestHours) && f.bestHours.length > 0) {
        bestByCheckpoint.set(f.checkpointId, f.bestHours[0]);
      }
    }
  }

  // SSE for real-time updates on this airport's checkpoints
  const { data: sseData, status: sseStatus, isPolling } =
    useSse<SseUpdate>(
      code ? `/api/checkpoints/airport/${code.toUpperCase()}/live` : null,
      {
        pollUrl: code ? `/api/checkpoints/airport/${code.toUpperCase()}` : null,
        pollInterval: 30000,
        pollParser: () => ({ checkpointId: "", minutes: Date.now(), source: "poll", reportedAt: new Date().toISOString() }),
      }
    );

  useEffect(() => {
    if (sseData?.source === "poll") {
      refetch();
      forecastsRefetch();
    } else if (
      sseData?.checkpointId &&
      data?.checkpoints.some((cp) => cp.id === sseData.checkpointId)
    ) {
      refetch();
      forecastsRefetch();
    }
  }, [sseData, data, refetch, forecastsRefetch]);

  // Submit a queued report to the API
  const submitReport = useCallback(async ({ checkpointId, minutes, source, reportedAt }: { checkpointId: string; minutes: number; source: string; reportedAt: string }): Promise<boolean> => {
    try {
      const res = await fetch(apiUrl(`/api/checkpoints/${checkpointId}/wait-times`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes, source, reportedAt }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  // Sync queue when coming back online
  useEffect(() => {
    if (isOnline) {
      void syncQueue(submitReport);
    }
  }, [isOnline, syncQueue, submitReport]);

  if (loading) return (
    <div>
      <div className="mb-6 space-y-2">
        <SkeletonHeading className="w-64" />
        <SkeletonText className="w-48" />
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
  if (error) return <div className="text-center py-8 text-red-600">Failed to load airport data.</div>;
  if (!data) return <div className="text-center py-8">Airport not found.</div>;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{data.name}</h2>
          <div className="flex items-center gap-2">
            <NotifyToggle airportId={data.id} airportCode={data.code} />
            {sseStatus === "open" && !isPolling && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" /> Live
              </span>
            )}
            {sseStatus === "connecting" && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Connecting…</span>
            )}
            {sseStatus === "error" && !isPolling && (
              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Live off</span>
            )}
            {isPolling && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Polling
              </span>
            )}
            {!isOnline && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Offline</span>
            )}
            {pendingCount > 0 && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>
        <p className="text-gray-500">
          {data.city}, {data.state} — {data.country}
        </p>
      </div>
      <h3 className="text-lg font-semibold mb-3">Checkpoints</h3>
      <div className="space-y-3">
        {data.checkpoints.map((cp) => (
          <div key={cp.id} className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
            <div className="flex-1">
              <p className="font-semibold">{cp.name}</p>
              <p className="text-sm text-gray-500">Terminal {cp.terminal || "N/A"}</p>
              <BestTimeChip
                best={bestByCheckpoint.get(cp.id)}
                loading={forecastsLoading}
              />
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={`/checkpoint/${cp.id}`}
                className="text-sm text-brandDark hover:underline"
                aria-label={`View details for ${cp.name}`}
              >
                Details →
              </Link>
              <div className={`text-right p-2 rounded-lg ${getWaitBg(cp.latestWaitTimeMinutes)}`}>
                <p className={`text-2xl font-bold ${getWaitColor(cp.latestWaitTimeMinutes)}`}>
                  {cp.latestWaitTimeMinutes !== null ? `${cp.latestWaitTimeMinutes} min` : "—"}
                </p>
                <p className="text-xs text-gray-400">{cp.source || "unknown"}</p>
              </div>
              <button
                onClick={() => setSelectedCheckpoint({ id: cp.id, name: cp.name })}
                className="text-sm bg-brand text-white px-3 py-1 rounded hover:bg-brandDark transition"
                aria-label={`Report wait time for ${cp.name}`}
              >
                Report
              </button>
            </div>
          </div>
        ))}
      </div>
      <Link to="/" className="text-brandDark text-sm mt-4 inline-block hover:underline">
        ← Back to live times
      </Link>

      {selectedCheckpoint && (
        <ReportModal
          checkpointId={selectedCheckpoint.id}
          checkpointName={selectedCheckpoint.name}
          onClose={() => setSelectedCheckpoint(null)}
          onReported={() => {
            setSelectedCheckpoint(null);
            refetch();
            forecastsRefetch();
          }}
        />
      )}
    </div>
  );
}
