import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { useSse } from "../hooks/useSse";
import { apiUrl } from "../lib/apiUrl";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import {
  SkeletonCard,
  SkeletonText,
  SkeletonHeading,
} from "../components/Skeleton";
import ReportModal from "../components/ReportModal";
import NotifyToggle from "../components/NotifyToggle";

interface WaitTimeEntry {
  id: string;
  minutes: number;
  source: string;
  reportType: string;
  reportedAt: string;
}

interface HistoryPoint {
  bucket: string;
  minutes: number;
  count: number;
}

interface HourPrediction {
  hour: number;
  forecastFor: string;
  predictedMinutes: number | null;
  confidence: number | null;
  sampleCount: number;
  source: "pattern" | "fallback" | "blended";
}

interface BestHour {
  hour: number;
  forecastFor: string;
  predictedMinutes: number;
}

interface PredictData {
  checkpointId: string;
  timezone: string;
  horizon: number;
  historyDays: number;
  sampleCount: number;
  overallAverageMinutes: number | null;
  currentConsensusMinutes: number | null;
  liveConsensusMinutes: number | null;
  predictions: HourPrediction[];
  bestHours: BestHour[];
}

interface CheckpointData {
  id: string;
  airportId: string;
  airportCode: string;
  airportName: string;
  code: string;
  name: string;
  terminal: string | null;
  latestWaitTimeMinutes: number | null;
  latestReportedAt: string | null;
  source: string | null;
  reportType: string | null;
  accuracy: number;
  estimatedWaitTimeMinutes: number | null;
  waitTimes: WaitTimeEntry[];
}

interface SseUpdate {
  minutes: number;
  source: string;
  reportedAt: string;
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

function getAccuracyColor(accuracy: number) {
  if (accuracy >= 70) return "text-green-600";
  if (accuracy >= 40) return "text-yellow-600";
  return "text-red-600";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Checkpoint() {
  const { id } = useParams<{ id: string }>();
  const [reporting, setReporting] = useState(false);
  const [historyHours, setHistoryHours] = useState(6);
  const { isOnline, pendingCount, syncQueue } = useOfflineQueue();

  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<CheckpointData>(id ? `/api/checkpoints/${id}` : null, [id]);

  const {
    data: historyData,
    loading: historyLoading,
    error: historyError,
  } = useApi<HistoryPoint[]>(
    id ? `/api/checkpoints/${id}/history?hours=${historyHours}` : null,
    [id, historyHours]
  );

  const {
    data: predictData,
    loading: predictLoading,
    error: predictError,
    refetch: predictRefetch,
  } = useApi<PredictData>(id ? `/api/checkpoints/${id}/predict` : null, [id]);

  // SSE for real-time updates on this specific checkpoint
  const { data: sseData, status: sseStatus, isPolling } = useSse<SseUpdate>(
    id ? `/api/checkpoints/${id}/stream` : null,
    {
      pollUrl: id ? `/api/checkpoints/${id}` : null,
      pollInterval: 30000,
      pollParser: () => ({ minutes: -1, source: "poll", reportedAt: new Date().toISOString() }),
    }
  );

  useEffect(() => {
    if (sseData?.minutes !== undefined) {
      refetch();
      predictRefetch();
    }
  }, [sseData, refetch, predictRefetch]);

  const chartData = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    return historyData.map((point) => ({
      time: formatTime(point.bucket),
      minutes: point.minutes,
      count: point.count,
    }));
  }, [historyData]);

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

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonHeading className="w-64" />
        <SkeletonText className="w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-80" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        Failed to load checkpoint data.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        Checkpoint not found.
      </div>
    );
  }

  const latest = data.latestWaitTimeMinutes;
  const waitTimeDisplay = latest !== null ? `${latest} min` : "—";
  const estimatedDisplay =
    data.estimatedWaitTimeMinutes !== null
      ? `${data.estimatedWaitTimeMinutes} min`
      : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-bold">{data.name}</h2>
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
          </div>
          <p className="text-gray-500 text-sm">
            {data.airportName} ({data.airportCode}) — Terminal {data.terminal || "N/A"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NotifyToggle airportId={data.airportId} airportCode={data.airportCode} />
          {!isOnline && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Offline</span>
          )}
          {pendingCount > 0 && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              {pendingCount} pending
            </span>
          )}
          <button
            onClick={() => setReporting(true)}
            className="text-sm bg-brand text-white px-4 py-2 rounded-lg hover:bg-brandDark transition font-semibold"
          >
            Report Time
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-lg shadow ${getWaitBg(latest)}`}>
          <p className="text-sm text-gray-500">Current Wait</p>
          <p className={`text-3xl font-bold ${getWaitColor(latest)}`}>
            {waitTimeDisplay}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Estimated Wait</p>
          <p className="text-3xl font-bold text-brand">
            {estimatedDisplay}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Accuracy</p>
          <p className={`text-3xl font-bold ${getAccuracyColor(data.accuracy)}`}>
            {data.accuracy}%
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Source</p>
          <p className="text-3xl font-bold text-gray-700 capitalize">
            {data.source || "—"}
          </p>
        </div>
      </div>

      {/* History chart */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Wait Time History</h3>
          <div className="flex gap-2">
            {[6, 12, 24].map((h) => (
              <button
                key={h}
                onClick={() => setHistoryHours(h)}
                className={`text-xs px-2 py-1 rounded ${
                  historyHours === h
                    ? "bg-brand text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
        {historyLoading ? (
          <SkeletonCard className="h-64" />
        ) : historyError ? (
          <p className="text-red-600 text-sm">Failed to load history.</p>
        ) : chartData.length === 0 ? (
          <p className="text-gray-500 text-sm">No history data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: unknown) => {
                  if (typeof value === 'number') return [`${value} min`, "Wait Time"];
                  return ["", "Wait Time"];
                }}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="minutes"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={{ fill: "#0ea5e9" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Forecast */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Forecast</h3>
          <span className="text-xs text-gray-400">
            {predictData?.predictions?.some((p) => p.source === "blended")
              ? "Live-adjusted pattern forecast"
              : "Pattern-based prediction from recent reports"}
          </span>
        </div>
        {predictLoading ? (
          <SkeletonCard className="h-24" />
        ) : predictError ? (
          <p className="text-red-600 text-sm">Failed to load forecast.</p>
        ) : !predictData ||
          !Array.isArray(predictData.predictions) ||
          predictData.predictions.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Not enough data to forecast yet. Reports from past weeks power predictions.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {predictData.predictions.map((p) => {
              const isBest = predictData.bestHours.some(
                (b) => b.forecastFor === p.forecastFor
              );
              const confidence = Math.round((p.confidence ?? 0) * 100);
              return (
                <div
                  key={p.forecastFor}
                  className={`min-w-[84px] p-3 rounded-lg border text-center shrink-0 ${
                    isBest ? "border-green-500 bg-green-50" : "border-gray-200"
                  }`}
                >
                  <p className="text-xs text-gray-500">{formatTime(p.forecastFor)}</p>
                  {p.source === "blended" && (
                    <p className="text-[10px] font-medium text-emerald-600">Live-adjusted</p>
                  )}
                  <p
                    className={`text-xl font-bold ${getWaitColor(
                      p.predictedMinutes
                    )}`}
                  >
                    {p.predictedMinutes !== null ? `${p.predictedMinutes} min` : "—"}
                  </p>
                  <div className="mt-1 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full"
                      style={{ width: `${confidence}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {isBest ? "Best time" : `${confidence}% confidence`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent reports table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h3 className="text-lg font-semibold p-4 border-b">Recent Reports</h3>
        {data.waitTimes.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">No reports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-3 font-semibold text-gray-600">Time</th>
                  <th className="p-3 font-semibold text-gray-600">Wait Time</th>
                  <th className="p-3 font-semibold text-gray-600">Source</th>
                </tr>
              </thead>
              <tbody>
                {data.waitTimes.slice(0, 10).map((wt) => (
                  <tr key={wt.id} className="border-t hover:bg-gray-50 transition">
                    <td className="p-3 text-gray-500">
                      {formatDateTime(wt.reportedAt)}
                    </td>
                    <td className="p-3 font-semibold">
                      <span className={getWaitColor(wt.minutes)}>
                        {wt.minutes} min
                      </span>
                    </td>
                    <td className="p-3 capitalize text-gray-500">
                      {wt.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Back link */}
      <Link
        to={`/airport/${data.airportCode.toLowerCase()}`}
        className="text-brandDark text-sm inline-block hover:underline"
      >
        ← Back to {data.airportName}
      </Link>

      {/* Report modal */}
      {reporting && (
        <ReportModal
          checkpointId={data.id}
          checkpointName={data.name}
          onClose={() => setReporting(false)}
          onReported={() => {
            setReporting(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
