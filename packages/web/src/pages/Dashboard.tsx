import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useEffect, useMemo, useState } from 'react'
import { useApi } from "../hooks/useApi";
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import { SkeletonCard, SkeletonHeading } from "../components/Skeleton";
import EmptyState from '../components/states/EmptyState'
import OfflineState from '../components/states/OfflineState'
import NetworkErrorState from '../components/states/NetworkErrorState'
import { ReportSheet } from '../components/ReportSheet'
import { DEFAULT_AIRPORT } from '../data/airports'

const STORAGE_KEY = 'flyby.selected-airport'

interface CheckpointMetric {
  id: string;
  name: string;
  code: string;
  terminal: string | null;
  airportCode: string;
  airportName: string;
  accuracy: number;
  estimatedWaitTimeMinutes: number | null;
  latestWaitTimeMinutes: number | null;
  latestReportedAt: string | null;
  source: string | null;
  totalReports: number;
}

interface DashboardData {
  summary: {
    totalCheckpoints: number;
    totalReports: number;
    avgAccuracy: number;
    generationSuccessRate: number;
    avgProcessingTime: number;
  };
  accuracyHistory: Array<{ hour: string; accuracy: number }>;
  checkpoints: CheckpointMetric[];
}

function getAccuracyColor(accuracy: number) {
  if (accuracy >= 70) return "text-green-600";
  if (accuracy >= 40) return "text-yellow-600";
  return "text-red-600";
}

function minutesAgo(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min === 1) return '1 min ago'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return `${h}h ago`
}

export default function Dashboard() {
  const { isOnline, pendingCount } = useOfflineQueue()
  const { data, loading, error, refetch } = useApi<DashboardData>("/api/dashboard", []);
  const [reportOpen, setReportOpen] = useState(false)
  const [selectedAirport, setSelectedAirport] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  )
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (selectedAirport) localStorage.setItem(STORAGE_KEY, selectedAirport)
  }, [selectedAirport])

  const checkpoints = useMemo(() => data?.checkpoints ?? [], [data])
  const filteredCheckpoints = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return checkpoints
    return checkpoints.filter(
      (cp) =>
        cp.airportCode.toLowerCase().includes(s) ||
        cp.airportName.toLowerCase().includes(s) ||
        cp.name.toLowerCase().includes(s),
    )
  }, [checkpoints, search])

  if (!isOnline) {
    return (
      <OfflineState
        onRetry={refetch}
        queuedCount={pendingCount}
      />
    )
  }

  if (loading) return (
    <div className="space-y-8">
      <SkeletonHeading className="w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} className="h-24" />)}
      </div>
      <SkeletonCard className="h-64" />
      <SkeletonCard className="h-80" />
    </div>
  );

  if (error) {
    return (
      <NetworkErrorState
        onRetry={refetch}
        onReportAnyway={() => {
          setSelectedAirport(selectedAirport ?? DEFAULT_AIRPORT.code)
          setReportOpen(true)
        }}
      />
    )
  }
  if (!data) return <div className="text-center py-8">No dashboard data available.</div>;

  const { summary, accuracyHistory, checkpoints: allCheckpoints } = data;

  const checkpointBars = allCheckpoints
    .map((cp) => ({
      name: `${cp.airportCode} ${cp.code}`,
      accuracy: cp.accuracy,
      waitTime: cp.estimatedWaitTimeMinutes ?? 0,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  const handleReport = () => {
    setSelectedAirport(selectedAirport ?? DEFAULT_AIRPORT.code)
    setReportOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Wait times</h2>
          <p className="mt-1 text-sm text-slate-500">
            Latest crowd-sourced security wait times by checkpoint.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReport}
          aria-label="Report a wait time"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-2"
        >
          Report wait time
        </button>
      </div>

      <div className="mt-4">
        <label htmlFor="dashboard-search" className="sr-only">
          Search checkpoints by airport or name
        </label>
        <input
          id="dashboard-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search checkpoints (e.g. JFK or Terminal)…"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 min-h-[44px]"
          data-testid="dashboard-search"
        />
      </div>

      {filteredCheckpoints.length === 0 && (
        <EmptyState
          illustration="no-data"
          headline="No checkpoints match"
          subhead="Try a different search term."
          primaryAction={{ label: 'Clear search', onClick: () => setSearch('') }}
          onPrimary={() => setSearch('')}
        />
      )}

      {/* Per-checkpoint wait times — primary traveler view */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h3 className="text-lg font-semibold p-4 border-b">Checkpoint wait times</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-3 font-semibold text-gray-600">Airport</th>
                <th className="p-3 font-semibold text-gray-600">Checkpoint</th>
                <th className="p-3 font-semibold text-gray-600">Terminal</th>
                <th className="p-3 font-semibold text-gray-600 text-right">Wait</th>
                <th className="p-3 font-semibold text-gray-600 text-right">Reported</th>
                <th className="p-3 font-semibold text-gray-600 text-right">Reports</th>
              </tr>
            </thead>
            <tbody>
              {filteredCheckpoints.map((cp) => (
                <tr key={cp.id} className="border-t hover:bg-gray-50 transition min-h-[44px]">
                  <td className="p-3 font-medium">{cp.airportCode}</td>
                  <td className="p-3">{cp.name}</td>
                  <td className="p-3 text-gray-500">{cp.terminal || "—"}</td>
                  <td className="p-3 text-right font-semibold">
                    {cp.latestWaitTimeMinutes !== null ? `${cp.latestWaitTimeMinutes} min` : "—"}
                  </td>
                  <td className="p-3 text-right text-sm text-slate-500">
                    {cp.latestReportedAt ? minutesAgo(cp.latestReportedAt) : "—"}
                  </td>
                  <td className="p-3 text-right text-gray-500">{cp.totalReports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary cards — internal metrics, demoted below traveler view */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Avg Accuracy</p>
          <p className={`text-3xl font-bold ${getAccuracyColor(summary.avgAccuracy)}`}>
            {summary.avgAccuracy}%
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Success Rate</p>
          <p className="text-3xl font-bold text-brand">{summary.generationSuccessRate}%</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Avg Processing</p>
          <p className="text-3xl font-bold text-gray-700">{summary.avgProcessingTime} min</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Reports</p>
          <p className="text-3xl font-bold text-gray-700">{summary.totalReports}</p>
        </div>
      </div>

      {/* Accuracy over time — internal metrics chart */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-4">Accuracy Score Over Time</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={accuracyHistory.length > 0 ? accuracyHistory : [{ hour: "0:00", accuracy: 0 }]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="accuracy"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={{ fill: "#0ea5e9" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Processing time per checkpoint — internal metrics chart */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-4">Processing Time per Checkpoint</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={checkpointBars.length > 0 ? checkpointBars : [{ name: "N/A", accuracy: 0, waitTime: 0 }]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="waitTime" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ReportSheet
        open={reportOpen}
        airportCode={selectedAirport ?? DEFAULT_AIRPORT.code}
        onClose={() => setReportOpen(false)}
        onReported={refetch}
      />
    </div>
  );
}
