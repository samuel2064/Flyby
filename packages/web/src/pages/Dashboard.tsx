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
import { useApi } from "../hooks/useApi";
import { SkeletonCard, SkeletonHeading } from "../components/Skeleton";

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

export default function Dashboard() {
  const { data, loading, error } = useApi<DashboardData>("/api/dashboard", []);

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

  if (error) return <div className="text-center py-8 text-red-600">Failed to load dashboard.</div>;
  if (!data) return <div className="text-center py-8">No dashboard data available.</div>;

  const { summary, accuracyHistory, checkpoints } = data;

  const checkpointBars = checkpoints
    .map((cp) => ({
      name: `${cp.airportCode} ${cp.code}`,
      accuracy: cp.accuracy,
      waitTime: cp.estimatedWaitTimeMinutes ?? 0,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Accuracy Metrics Dashboard</h2>

      {/* Summary cards */}
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

      {/* Accuracy over time (line chart) */}
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

      {/* Processing time per checkpoint (bar chart) */}
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

      {/* Per-checkpoint breakdown table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h3 className="text-lg font-semibold p-4 border-b">Per-Checkpoint Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-3 font-semibold text-gray-600">Airport</th>
                <th className="p-3 font-semibold text-gray-600">Checkpoint</th>
                <th className="p-3 font-semibold text-gray-600">Terminal</th>
                <th className="p-3 font-semibold text-gray-600 text-right">Accuracy</th>
                <th className="p-3 font-semibold text-gray-600 text-right">Est. Wait</th>
                <th className="p-3 font-semibold text-gray-600 text-right">Reports</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map((cp) => (
                <tr key={cp.id} className="border-t hover:bg-gray-50 transition">
                  <td className="p-3 font-medium">{cp.airportCode}</td>
                  <td className="p-3">{cp.name}</td>
                  <td className="p-3 text-gray-500">{cp.terminal || "—"}</td>
                  <td className={`p-3 text-right font-semibold ${getAccuracyColor(cp.accuracy)}`}>
                    {cp.accuracy}%
                  </td>
                  <td className="p-3 text-right">
                    {cp.estimatedWaitTimeMinutes !== null ? `${cp.estimatedWaitTimeMinutes} min` : "—"}
                  </td>
                  <td className="p-3 text-right text-gray-500">{cp.totalReports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
