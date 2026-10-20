/**
 * API base URL resolution.
 *
 * The app calls the API with relative paths ("/api/...", "/v1/auth/...") which
 * work out of the box in dev (Vite proxy) and when the API is served from the
 * same origin. When the API lives on a different origin (e.g. the production
 * static deploy targets a remote API host), set VITE_API_BASE_URL and every
 * fetch/EventSource call is prefixed with it.
 *
 * Unset VITE_API_BASE_URL -> "" -> all paths stay relative (dev behavior,
 * existing tests, E2E) so this is a strict no-op unless configured.
 */

export function apiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const base = (raw ?? "").replace(/\/+$/, "");
  if (!base) return path;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
