import { useAuth } from "../contexts/AuthContext";
import { useApi } from "../hooks/useApi";
import { Link } from "react-router-dom";
import NotificationPreferences from "../components/NotificationPreferences";

interface Report {
  id: string;
  minutes: number;
  createdAt: string;
  checkpoint: {
    id: string;
    name: string;
    airport: {
      code: string;
      city: string;
    };
  };
}

export default function Profile() {
  const { user } = useAuth();
  const { data: reports, loading, error } = useApi<Report[]>('/v1/auth/me/reports', []);

  if (!user) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Please log in to view your profile.</p>
        <Link to="/login" className="text-brand hover:underline mt-2 inline-block">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-2xl font-bold mb-2">{user.displayName || "Traveler"}</h2>
        <p className="text-gray-600">{user.email}</p>
      </div>

      <NotificationPreferences />

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-semibold mb-4">Your Reports</h3>
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && (!reports || reports.length === 0) && (
          <p className="text-gray-500">No reports yet. <Link to="/" className="text-brand hover:underline">Submit your first report!</Link></p>
        )}
        {!loading && reports && reports.length > 0 && (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{report.checkpoint.name}</p>
                    <p className="text-sm text-gray-600">{report.checkpoint.airport.city} ({report.checkpoint.airport.code})</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-brand/10 text-brand px-3 py-1 rounded-full text-sm font-semibold">
                      {report.minutes} min
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
