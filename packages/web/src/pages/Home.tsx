import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { useApi } from '../hooks/useApi';
import { apiUrl } from '../lib/apiUrl';
import { useSse } from '../hooks/useSse';
import { useRefreshInterval } from '../hooks/useRefreshInterval';
import { SkeletonCard } from '../components/Skeleton';
import ReportModal from '../components/ReportModal';

interface Checkpoint {
  id: string;
  airportCode: string;
  airportName: string;
  code: string;
  name: string;
  terminal: string | null;
  latestWaitTimeMinutes: number | null;
  latestReportedAt: string | null;
  source: string | null;
}

interface SseUpdate {
  checkpointId: string;
  minutes: number;
  source: string;
  reportedAt: string;
}

function getWaitColor(minutes: number | null) {
  if (minutes === null) return 'text-gray-400';
  if (minutes <= 15) return 'text-green-600';
  if (minutes <= 30) return 'text-yellow-600';
  return 'text-red-600';
}

function getWaitBg(minutes: number | null) {
  if (minutes === null) return 'bg-gray-100';
  if (minutes <= 15) return 'bg-green-50';
  if (minutes <= 30) return 'bg-yellow-50';
  return 'bg-red-50';
}

type AirportGroup = {
  code: string;
  name: string;
  checkpoints: Checkpoint[];
  avgWaitTime: number | null;
};

function groupByAirport(checkpoints: Checkpoint[]): AirportGroup[] {
  const map = new Map<string, AirportGroup>();
  for (const cp of checkpoints) {
    const existing = map.get(cp.airportCode);
    if (existing) {
      existing.checkpoints.push(cp);
      const times = existing.checkpoints.map((c) => c.latestWaitTimeMinutes).filter((m): m is number => m !== null);
      existing.avgWaitTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
    } else {
      map.set(cp.airportCode, {
        code: cp.airportCode,
        name: cp.airportName,
        checkpoints: [cp],
        avgWaitTime: cp.latestWaitTimeMinutes,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export default function Home() {
  const [reporting, setReporting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { isOnline, pendingCount, syncQueue } = useOfflineQueue();
  const { data, loading, error, isRevalidating, refetch } = useApi<Checkpoint[]>('/api/checkpoints', []);
  const checkpoints = useMemo(() => data ?? [], [data]);

  // Auto-refresh every 30 seconds while the page is visible
  useRefreshInterval(() => {
    refetch();
  }, 30_000);

  const fetchData = useCallback(() => {
    refetch();
  }, [refetch]);

  // Submit a queued report to the API
  const submitReport = useCallback(async ({ checkpointId, minutes, source, reportedAt }: { checkpointId: string; minutes: number; source: string; reportedAt: string }): Promise<boolean> => {
    try {
      const res = await fetch(apiUrl(`/api/checkpoints/${checkpointId}/wait-times`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // SSE for real-time updates
  const { data: sseData, status: sseStatus, isPolling } = useSse<SseUpdate>(
    '/api/checkpoints/stream',
    {
      pollUrl: '/api/checkpoints',
      pollInterval: 30000,
      pollParser: () => ({ checkpointId: '', minutes: Date.now(), source: 'poll', reportedAt: new Date().toISOString() }),
    }
  );

  useEffect(() => {
    if (sseData?.source === 'poll') {
      refetch();
    } else if (sseData?.checkpointId && sseData.minutes !== undefined) {
      refetch();
    }
  }, [sseData, refetch]);

  // Group and filter logic
  const grouped = useMemo(() => groupByAirport(checkpoints), [checkpoints]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return grouped;
    return grouped
      .map((g) => ({
        ...g,
        checkpoints: g.checkpoints.filter(
          (cp) =>
            cp.airportCode.toLowerCase().includes(s) ||
            cp.airportName.toLowerCase().includes(s) ||
            cp.name.toLowerCase().includes(s),
        ),
      }))
      .filter((g) => g.checkpoints.length > 0);
  }, [grouped, search]);

  const toggleExpanded = useCallback((code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  if (loading) return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Live Wait Times</h2>
        <div className="flex items-center gap-2">
          {isRevalidating && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded flex items-center gap-1" data-testid="revalidating-status">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block" /> Updating…
            </span>
          )}
          {sseStatus === 'open' && !isPolling && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded flex items-center gap-1" data-testid="sse-status">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" /> Live
            </span>
          )}
          {sseStatus === 'connecting' && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Connecting…</span>
          )}
          {sseStatus === 'error' && !isPolling && (
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
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{pendingCount} pending</span>
          )}
        </div>
      </div>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search airport or checkpoint…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          data-testid="home-search"
        />
      </div>

      {/* Results */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg">No checkpoints found</p>
            <p className="text-sm mt-1">Try a different search term</p>
          </div>
        )}

        {filtered.map((group) => {
          const isExpanded = expanded.has(group.code);
          return (
            <div key={group.code} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Airport header */}
              <button
                onClick={() => toggleExpanded(group.code)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
                aria-expanded={isExpanded}
                data-testid={`airport-header-${group.code}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-brand w-16 text-center">
                    {group.code}
                  </span>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">{group.name}</p>
                    <p className={group.avgWaitTime !== null ? 'text-sm text-gray-500' : 'text-sm text-gray-400'}>
                      {group.avgWaitTime !== null ? `Avg wait: ${group.avgWaitTime} min` : 'No recent data'}
                    </p>
                  </div>
                </div>
                <span className={`text-lg text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {/* Checkpoint list */}
              {isExpanded && (
                <div className="border-t border-gray-100" data-testid={`airport-checkpoints-${group.code}`}>
                  {group.checkpoints.map((cp) => (
                    <div key={cp.id} className="p-4 border-b border-gray-50 last:border-b-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm text-gray-500">Terminal {cp.terminal || 'N/A'}</p>
                          <h3 className="text-lg font-semibold">{cp.name}</h3>
                        </div>
                        <div className={`text-right p-2 rounded-lg ${getWaitBg(cp.latestWaitTimeMinutes)}`}>
                          <p className={`text-2xl font-bold ${getWaitColor(cp.latestWaitTimeMinutes)}`}>
                            {cp.latestWaitTimeMinutes !== null ? `${cp.latestWaitTimeMinutes} min` : '—'}
                          </p>
                          <p className="text-xs text-gray-400">{cp.source || 'unknown'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <Link to={`/airport/${cp.airportCode.toLowerCase()}`} className="text-sm text-brandDark hover:underline">View airport →</Link>
                        <button onClick={() => setReporting(cp.id)} className="text-sm bg-brand text-white px-3 py-1 rounded hover:bg-brandDark transition">Report time</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {reporting && (
        <ReportModal
          checkpointId={reporting}
          checkpointName={checkpoints.find((c) => c.id === reporting)?.name || ''}
          onClose={() => setReporting(null)}
          onReported={fetchData}
        />
      )}
    </div>
  );
}
