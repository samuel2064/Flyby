# MVP Features

## Frontend (PWA)
- [x] Airport search page
- [x] Airport detail page with checkpoints
- [x] Home page with all checkpoints and latest wait times
- [x] PWA: service worker, manifest, install prompt
- [x] Tailwind CSS styling
- [x] React Router navigation
- [x] Real-time SSE updates (live wait time changes)
- [x] Offline report queue (auto-sync when online)
- [x] Offline status indicators
- [x] Error boundary (catch-all crash protection)
- [x] Skeleton loading states (all pages)
- [x] Rate limit feedback with countdown timer
- [x] Checkpoint page Forecast section (hourly pattern-based predictions with confidence bars, best-time highlight, and "Live-adjusted" badge on live-blended hours)
- [x] Airport page per-checkpoint "best time today" chips (single batched forecast call, refetch on SSE updates, loading skeleton, no fabrication on empty data, chip hidden on fetch error)
- [x] useApi hook (reusable fetch wrapper with loading/error/abort)
- [x] useDebounce hook (search input debounce)
- [x] useApiMutation hook (POST/PUT/PATCH/DELETE with loading/error/success)
- [x] 404 Not Found page with back-to-home link
- [x] Geolocation-based nearby airport search
- [x] Login page with JWT token storage
- [x] Signup page with account creation
- [x] Profile page notification preferences editor (DND hours, threshold, spike sensitivity)

## Backend (API)
- [x] Express server
- [x] Prisma schema with SQLite (dev) / PostgreSQL (prod)
- [x] Airport search endpoint (text + geospatial)
- [x] Airport detail with checkpoints endpoint
- [x] Checkpoints listing endpoint
- [x] Report wait time endpoint (with rate limiting)
- [x] Checkpoint aggregated statistics endpoint (/api/checkpoints/:id/stats)
- [x] Pattern-based wait-time forecast endpoint (/api/checkpoints/:id/predict) with hour-of-day matching, fallback averaging, per-hour confidence, best-time ranking, and airport-local timezone bucketing
- [x] Live crowd-consensus blending of imminent forecast slots (60-min live window, 60/40 current hour + 30/70 next hour, combined evidence-pool confidence, live reports excluded from the pattern baseline to avoid double-counting, blended slots eligible for bestHours)
- [x] Batched airport forecast endpoint (GET /api/airports/:code/forecasts) returning per-checkpoint bestHours + next-hour predictions in ONE call, sharing the predict core so batch and single results never diverge; empty predictions/bestHours for checkpoints with no reports (no fabrication)
- [x] Admin-only report deletion endpoint (DELETE /api/reports/:id) for QA test-record cleanup: X-Admin-Key/Bearer auth with constant-time compare, fail-closed 503 when ADMIN_API_KEY unset, 404 on unknown ids, structured report_deleted audit log
- [x] Report abuse flagging (POST /api/reports/:id/flag): one flag per session (409 on repeat), reason enum + optional note, structured report_flagged audit log, reports with >=3 flags from distinct sessions are excluded from all wait math (checkpoint lists, history, stats, forecasts, SSE latest, dashboard, notification baselines); moderation queue at GET /api/reports/flagged
- [x] SSE streaming endpoint (global + per-checkpoint)
- [x] Checkpoints by airport code endpoint (with aggregated wait times)
- [x] SSE streaming endpoint (by airport code)
- [x] lineType support (standard/preclear/clear) on report endpoint
- [x] Field aliases (waitTimeMinutes, timestamp) on report endpoint
- [x] Seed data (51 airports, 159 checkpoints)
- [x] Redis pub/sub for SSE
- [x] Push notification subscription endpoint
- [x] NotificationSubscription Prisma model + migration
- [x] Notification preference API (GET/PATCH /api/notifications/preferences) with DND hours, threshold, spike, validation
- [x] Auto-trigger push notifications on report submission (gated by FLYBY_AUTO_NOTIFICATIONS)
- [x] Per-subscriber alert evaluation (thresholdMinutes + spikePercent from NotificationPreference drive evaluateAlert per subscriber; DND preference already wired)
- [x] Per-subscriber leave-now multiplier (leaveNowPercent on NotificationPreference replaces the hard-coded 1.5x historical-average gate; wired through evaluateAlert + dispatch + Profile UI slider)
- [x] Per-subscriber notification cooldown (rateLimitMinutes on NotificationPreference, 5-1440 min, drives dispatch rate-limit window per airport; Profile UI slider)

## DevEx
- [x] npm workspaces monorepo
- [x] Vite for frontend build
- [x] Vitest for testing (frontend + backend)
- [x] ts-node / tsx for dev server
- [x] GitHub Actions CI/CD pipeline (test, coverage, build, e2e, artifacts)
- [x] Concurrent job execution with matrix builds (Node 20.x, 22.x)
- [x] Coverage enforcement (70% thresholds) in CI
- [x] Build artifact uploads for debugging
- [x] Comprehensive README documentation
- [x] Staging + production deploy skeleton jobs with placeholders
- [x] E2E port overrides (E2E_API_PORT / E2E_WEB_PORT) so the Playwright suite runs even when default ports 3000/3001 are occupied

## Test Coverage
- Backend: 699 tests (API endpoints, SSE, seed logic, auth, me, waitTimeUtils, float validation, edge cases, middleware, error handling, input validation, airport errors, dashboard errors, metrics, prisma, rate limits, server, users errors, lineType, airport checkpoints, field aliases, notifications subscribe/send/preferences, notifications auto-trigger, notification preferences per-subscriber dispatch (threshold/spike/leaveNowPercent), per-subscriber tunable rateLimitMinutes cooldown, checkpoint aggregated stats, pattern-based wait-time forecast (hour-of-day matching, fallback averaging, confidence, best hours, timezone bucketing, live blending of imminent slots with 60-min window boundary), batched airport forecasts (shape, deterministic bestHours, predict-parity, no-report empty, live blending), admin report deletion (auth, fail-closed, audit log), wait-time reporting endpoints comprehensive validation, field aliases, lineType/reportType, authenticated user association, rate limiting, SSE endpoints, airport-specific endpoints, performance/load testing, database integration, edge cases, one-row-per-checkpoint latest-report-wins semantics on all traveler-facing checkpoint list endpoints (global list, airport checkpoints, single checkpoint, 3-letter delegation), report abuse flagging (validation, session dedupe 409, flag-count exclusion from math at threshold, moderation queue), dashboard aggregation (wait-times summary with 3h trend windows, per-airport wait-stats with percentiles and hour/day buckets, cache + moderation invalidation), deploy-compat adapter (wait-times list+alias writes with identity rate limit and aliases, events SSE translations, ck-slug checkpoint id resolution across native routes))
- Frontend: 377 tests (components, offline queue, error boundary, rate limit, airport incl. per-checkpoint best-time-today forecast chips (render, empty no-fabrication, skeleton, error resilience, airport-local hour), dashboard, search, login, signup, useApi, useDebounce, useApiMutation, NotFound, useSse, ProtectedRoute, Skeleton, Profile, AuthContext, Checkpoint incl. Forecast section (predicted minutes, confidence bars, best-time badge, Live-adjusted badge, empty/error/loading states), useRefreshInterval, offlineQueue, NotificationPreferences editor with leave-now + rate-limit cooldown sliders)
- E2E: 20 Playwright tests (home, search, airport-detail, report-wait-time, auth flows login/signup/protected routes, airport-page forecast chips — per-card render, chip format contract, cards independent of forecast fetch) + 2 Playwright config port-override regression tests
- Total: 1098/1098 tests passing (100%) — verified 2026-09-25
- Coverage thresholds: 70% (statements, branches, functions, lines) - EXCEEDED (API 90.78% / Web 90.41% statements, verified 2026-09-20)
