import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { useApiMutation } from "../hooks/useApiMutation";

interface NotificationPrefs {
  dndEnabled: boolean;
  dndStartHour: number;
  dndEndHour: number;
  thresholdMinutes: number;
  spikePercent: number;
  leaveNowPercent: number;
  rateLimitMinutes: number;
}

const DEFAULT_PREFS: NotificationPrefs = {
  dndEnabled: true,
  dndStartHour: 22,
  dndEndHour: 6,
  thresholdMinutes: 30,
  spikePercent: 100,
  leaveNowPercent: 150,
  rateLimitMinutes: 60,
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

/**
 * NotificationPreferences — authenticated user's alert preference editor.
 * Wired to GET /api/notifications/preferences + PATCH (partial update).
 * Renders nothing when the user is unauthenticated (handled by Profile).
 */
export default function NotificationPreferences() {
  const { data, loading, error, refetch } = useApi<NotificationPrefs>("/api/notifications/preferences", []);
  const { mutate, loading: saving, error: saveError } = useApiMutation<NotificationPrefs, Partial<NotificationPrefs>>();

  const [draft, setDraft] = useState<NotificationPrefs | null>(null);

  // Sync fetched prefs into the local draft whenever new data arrives.
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (loading && !draft) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6" aria-busy="true">
        <h3 className="text-xl font-semibold mb-4">Notification Preferences</h3>
        <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error && !draft) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-semibold mb-4">Notification Preferences</h3>
        <p className="text-red-600" role="alert">{error}</p>
      </div>
    );
  }

  const current = draft ?? DEFAULT_PREFS;

  function set<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    setDraft({ ...current, [key]: value });
  }

  async function handleSave() {
    if (!draft) return;
    await mutate(draft, {
      url: "/api/notifications/preferences",
      method: "PATCH",
      onSuccess: () => refetch(),
    });
  }

  const dirty = !!data && !!draft && (
    data.dndEnabled !== draft.dndEnabled ||
    data.dndStartHour !== draft.dndStartHour ||
    data.dndEndHour !== draft.dndEndHour ||
    data.thresholdMinutes !== draft.thresholdMinutes ||
    data.spikePercent !== draft.spikePercent ||
    data.leaveNowPercent !== draft.leaveNowPercent ||
    data.rateLimitMinutes !== draft.rateLimitMinutes
  );

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <h3 className="text-xl font-semibold mb-4">Notification Preferences</h3>

      <div className="space-y-6">
        {/* Threshold */}
        <div>
          <label htmlFor="pref-threshold" className="block text-sm font-medium mb-1">
            Alert threshold: <span className="font-semibold text-brand">{current.thresholdMinutes} min</span>
          </label>
          <input
            id="pref-threshold"
            type="range"
            min={1}
            max={120}
            value={current.thresholdMinutes}
            onChange={(e) => set("thresholdMinutes", Number(e.target.value))}
            className="w-full"
            aria-label="Alert threshold in minutes"
          />
          <p className="text-xs text-gray-500 mt-1">Alert when wait time exceeds this many minutes.</p>
        </div>

        {/* Spike sensitivity */}
        <div>
          <label htmlFor="pref-spike" className="block text-sm font-medium mb-1">
            Spike sensitivity: <span className="font-semibold text-brand">{current.spikePercent}%</span>
          </label>
          <input
            id="pref-spike"
            type="range"
            min={1}
            max={500}
            step={5}
            value={current.spikePercent}
            onChange={(e) => set("spikePercent", Number(e.target.value))}
            className="w-full"
            aria-label="Spike sensitivity percent"
          />
          <p className="text-xs text-gray-500 mt-1">Alert when wait time jumps by at least this percent vs. the previous report.</p>
        </div>

        {/* Leave-now sensitivity */}
        <div>
          <label htmlFor="pref-leave-now" className="block text-sm font-medium mb-1">
            Leave-now sensitivity: <span className="font-semibold text-brand">{(current.leaveNowPercent / 100).toFixed(1)}× historical average</span>
          </label>
          <input
            id="pref-leave-now"
            type="range"
            min={100}
            max={300}
            step={10}
            value={current.leaveNowPercent}
            onChange={(e) => set("leaveNowPercent", Number(e.target.value))}
            className="w-full"
            aria-label="Leave-now sensitivity multiplier over historical average"
          />
          <p className="text-xs text-gray-500 mt-1">
            Recommend departure when the current wait exceeds the 24h historical average by this multiple. Lower is more sensitive (e.g. 1.0× fires as soon as the wait is above average); higher is calmer.
          </p>
        </div>

        {/* Rate-limit window */}
        <div>
          <label htmlFor="pref-rate-limit" className="block text-sm font-medium mb-1">
            Notification cooldown: <span className="font-semibold text-brand">{current.rateLimitMinutes} min</span>
          </label>
          <input
            id="pref-rate-limit"
            type="range"
            min={5}
            max={1440}
            step={5}
            value={current.rateLimitMinutes}
            onChange={(e) => set("rateLimitMinutes", Number(e.target.value))}
            className="w-full"
            aria-label="Minimum minutes between notifications per airport"
          />
          <p className="text-xs text-gray-500 mt-1">
            Minimum gap between notifications for the same airport. Lower means more frequent alerts; higher means fewer (e.g. a one-off spike won't spam you all morning).
          </p>
        </div>

        {/* DND toggle */}
        <div className="flex items-start gap-3">
          <input
            id="pref-dnd"
            type="checkbox"
            checked={current.dndEnabled}
            onChange={(e) => set("dndEnabled", e.target.checked)}
            className="mt-1"
            aria-label="Enable Do Not Disturb hours"
          />
          <div>
            <label htmlFor="pref-dnd" className="block text-sm font-medium">Do Not Disturb</label>
            <p className="text-xs text-gray-500">Pause notifications during a quiet-hours window.</p>
          </div>
        </div>

        {/* DND window (only visible when DND is enabled) */}
        {current.dndEnabled && (
          <div className="grid grid-cols-2 gap-4" data-testid="dnd-window">
            <div>
              <label htmlFor="pref-dnd-start" className="block text-sm font-medium mb-1">Quiet hours start</label>
              <select
                id="pref-dnd-start"
                value={current.dndStartHour}
                onChange={(e) => set("dndStartHour", Number(e.target.value))}
                className="w-full border border-gray-300 rounded-md p-2"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pref-dnd-end" className="block text-sm font-medium mb-1">Quiet hours end</label>
              <select
                id="pref-dnd-end"
                value={current.dndEndHour}
                onChange={(e) => set("dndEndHour", Number(e.target.value))}
                className="w-full border border-gray-300 rounded-md p-2"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </div>
            <p className="col-span-2 text-xs text-gray-500">
              {current.dndStartHour === current.dndEndHour
                ? "Window is empty — DND effectively disabled."
                : current.dndStartHour < current.dndEndHour
                ? `Pause notifications between ${formatHour(current.dndStartHour)} and ${formatHour(current.dndEndHour)}.`
                : `Pause notifications from ${formatHour(current.dndStartHour)} through midnight to ${formatHour(current.dndEndHour)}.`}
            </p>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="bg-brand text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand/90"
            aria-label="Save notification preferences"
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
          {dirty && !saving && (
            <button
              type="button"
              onClick={() => setDraft(data)}
              className="text-sm text-gray-600 hover:underline"
            >
              Discard changes
            </button>
          )}
          {saveError && (
            <p className="text-red-600 text-sm" role="alert">{saveError}</p>
          )}
          {!dirty && !saving && !saveError && data && (
            <p className="text-green-600 text-sm" role="status">Saved.</p>
          )}
        </div>
      </div>
    </div>
  );
}
