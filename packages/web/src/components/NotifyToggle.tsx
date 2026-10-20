import { useState, useEffect } from "react";
import { usePushNotification } from "../hooks/usePushNotification";

interface NotifyToggleProps {
  airportId: string;
  airportCode: string;
}

/**
 * Per-airport "Notify me" toggle.
 *
 * Flow:
 *  - If push is not supported, toggle is disabled with explanatory tooltip.
 *  - On enable: request notification permission, then subscribe via the
 *    Web Push API, then POST the subscription to /api/notifications/subscribe
 *    along with the airportId (handled inside usePushNotification).
 *  - On disable: unsubscribe the current PushSubscription.
 *
 * Visual states: idle / requesting / enabled / error.
 */
export default function NotifyToggle({ airportId, airportCode }: NotifyToggleProps) {
  const { isSupported, hasPermission, loading, error, subscription, subscribe, unsubscribe, requestPermission } =
    usePushNotification({ enabled: true, airportId });

  // Track whether the user has explicitly enabled notify for THIS airport.
  // Persisting per-airport enabled state in localStorage survives reloads and
  // is independent of whether the PushSubscription object is currently held
  // (e.g. cleared by a different tab).
  const storageKey = `flyby:notify:${airportId}`;
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  // Keep local enabled state roughly in sync with whether a PushSubscription exists.
  useEffect(() => {
    if (!subscription && enabled && !loading) {
      // Subscription was lost externally (cleared by SW update / browser) —
      // keep the user's intent but reflect that we are no longer actively subscribed.
    }
  }, [subscription, enabled, loading]);

  function persist(next: boolean) {
    setEnabled(next);
    try {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // Ignore storage failures (private mode, quota).
    }
  }

  async function handleToggle() {
    if (!isSupported || loading) return;

    if (enabled) {
      const ok = await unsubscribe();
      if (ok) persist(false);
      return;
    }

    // Enabling: request permission first, then subscribe.
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    const ok = await subscribe();
    if (ok) persist(true);
  }

  if (!isSupported) {
    return (
      <span
        className="text-xs text-gray-400 px-2 py-1 rounded border border-gray-200"
        title="Push notifications are not supported in this browser"
        aria-label={`Notifications not supported for ${airportCode}`}
      >
        Notify unavailable
      </span>
    );
  }

  const tone = enabled
    ? "bg-brand/10 text-brand border-brand/30"
    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50";

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={loading}
        onClick={handleToggle}
        className={`text-xs px-3 py-1 rounded border transition font-semibold ${tone} ${loading ? "opacity-60 cursor-wait" : ""}`}
        aria-label={`Toggle notifications for ${airportCode}`}
        data-testid="notify-toggle"
      >
        {loading ? "…" : enabled ? "Notify on" : "Notify me"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
