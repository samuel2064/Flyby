# Flyby API Specification

## Base URL
All endpoints are relative to the API base (e.g., `http://localhost:3001`).

## Authentication
Most endpoints require no authentication. Authenticated user endpoints use a JWT Bearer token in the `Authorization` header, obtained from `POST /v1/auth/login`. The admin-only `DELETE /api/reports/:id` endpoint requires an admin API key (see that endpoint for details). Rate limiting is applied per session (identified by `X-Session-Id` header or client IP for anonymous usage, or by JWT for authenticated users).

## SSE Event Schema
`GET /api/checkpoints/:id/stream` returns a stream of Server-Sent Events. (Note: SSE specs differ from the standard — authentication is not required, unlike the REST endpoints above.)

- **Content-Type**: `text/event-stream`
- **Cache-Control**: `no-cache`
- **Connection**: `keep-alive`

### Event Payload Format
Each event is a JSON object with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `minutes` | number | Latest reported wait time in minutes |
| `source` | string | Source of the report: `crowd`, `pattern`, or `official` |
| `reportType` | string | Type of report line: `standard`, `precheck`, or `clear` |
| `reportedAt` | string | ISO 8601 timestamp of the report |
| `accuracy` | number | (Optional) Accuracy score 0-100 if available |

Example per-checkpoint stream (`/api/checkpoints/:id/stream`):
```json
{
  "minutes": 25,
  "source": "crowd",
  "reportType": "standard",
  "reportedAt": "2026-05-21T18:00:00.000Z"
}
```

Example global stream (`/api/checkpoints/stream`):
```json
{
  "checkpointId": "uuid",
  "minutes": 25,
  "source": "crowd",
  "reportedAt": "2026-05-21T18:00:00.000Z"
}
```

---

## Endpoints

### GET /health
Health check with service status.

**Response**
- `201 Created` — `{ data: { WaitTime } }`
- `400 Bad Request` — Invalid minutes, missing checkpointId, invalid reportedAt, or invalid lineType
- `404 Not Found` — Checkpoint not found
- `429 Too Many Requests` — Rate limit exceeded

**Additional Fields**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lineType` | string | No | Line type: `standard` (default), `preclear`, or `clear` |
| `reportType` | string | No | Alternative to `lineType` (same values) |

**Field Aliases**
- `waitTimeMinutes` can be used instead of `minutes`
- `timestamp` can be used instead of `reportedAt`

**Rate Limiting**
- One report per 30 seconds per session.
- `429` response includes:
```json
{
  "error": "Rate limit exceeded...",
  "retryAfter": 27
}
```

---

### GET /api/airports
Alias for /api/airports/search.

### GET /api/airports/search
Search airports by code, name, or city. Supports geospatial nearby search.

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | No (unless geo) | Search query (min 2 chars) |
| `lat` | number | No | Latitude for geospatial search |
| `lng` | number | No | Longitude for geospatial search |
| `radiusMiles` | number | No | Radius in miles for geospatial search (default: 50) |

**Note**: Either `q` OR (`lat` AND `lng`) is required.

**Responses**
- `200 OK` — Returns array of airports
- `400 Bad Request` — Missing or invalid query parameters
- `500 Internal Server Error` — Database unavailable

---

### GET /api/airports/:code
Get a single airport by its 3-letter IATA code, including checkpoints and latest wait times.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `code` | string | Airport IATA code (e.g., `JFK`) |

**Responses**
- `200 OK` — Airport object with `checkpoints`
- `404 Not Found` — Airport not found

---

### GET /api/airports/:code/forecasts
Batch pattern-based wait-time forecast for every checkpoint at an airport in
ONE call. Powers the Airport page's per-checkpoint "best time today" chips
without N separate `/predict` round trips. Prediction math is shared with the
single-checkpoint predict endpoint, so batch and single results can never
diverge.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `code` | string | Airport IATA code (e.g., `JFK`); case-insensitive |

**Query Parameters**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `horizon` | int 1–24 | `12` | Number of upcoming local hours to forecast |
| `days` | int 1–30 | `30` | History window in days |

**Responses**
- `200 OK` — `{ data: { airportCode, airportName, timezone, historyDays, horizon, forecasts: [...] } }`
  where each `forecasts[]` entry mirrors the per-checkpoint predict core:
  `checkpointId`, `code`, `name`, `terminal`, `timezone`, `sampleCount`,
  `overallAverageMinutes`, `currentConsensusMinutes`, `liveConsensusMinutes`,
  `predictions[]`, `bestHours[]` (see `GET /api/checkpoints/:id/predict`).
  Checkpoints with zero reports in the window return empty `predictions` and
  `bestHours` (never fabricated estimates).
- `400 Bad Request` — Invalid airport code or out-of-range `horizon`/`days`
- `404 Not Found` — Airport not found

---

### GET /api/checkpoints
List all checkpoints with latest wait times.

**Responses**
- `200 OK` — Array of checkpoint objects, each with:
  - `id`, `airportCode`, `airportName`, `code`, `name`, `terminal`
  - `latestWaitTimeMinutes`
  - `latestReportedAt`
  - `source`
  - `accuracy` (0-100)
  - `estimatedWaitTimeMinutes`

---

### GET /api/checkpoints/:id
Get a single checkpoint with wait time history.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Checkpoint UUID |

**Responses**
- `200 OK` — Checkpoint object with `waitTimes` array and `accuracy`
- `404 Not Found` — Checkpoint not found

---

### GET /api/checkpoints/:id/history
Get historical wait time data (sparkline data) for a checkpoint.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Checkpoint UUID |

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `hours` | number | No | Number of hours to look back (default: 6, max: 24) |

**Responses**
- `200 OK` — Array of data points:
  - `bucket`: ISO timestamp of the 15-minute bucket
  - `minutes`: Average wait time for that bucket
  - `count`: Number of reports in that bucket
- `404 Not Found` — Checkpoint not found

---

### GET /api/checkpoints/:id/stats
Get aggregated wait-time statistics for a checkpoint over a time window.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Checkpoint UUID |

**Query Parameters**
| Param | Type | Required | Description |
|-------|----------|----------|-------------|
| `hours` | number | No | Look-back window in hours (default: 24, max: 168) |

**Responses**
- `200 OK` — Aggregated stats object:
  - `checkpointId`, `airportCode`, `airportName`, `code`, `name`, `terminal`
  - `windowHours`: the look-back window used
  - `count`: number of reports in the window (0 if none)
  - `min`, `max`, `avg`, `median`, `p90`: wait-time stats (null when count is 0)
  - `byReportType`: array of `{ reportType, count, avg }` sorted by count desc
  - `byHourOfDay`: array of `{ hour, count, avg }` (local airport timezone) sorted by hour asc
  - `trend`: `{ firstHalfAvg, secondHalfAvg, delta }` or null when fewer than 2 reports
- `400 Bad Request` — Invalid id or `hours` out of range
- `404 Not Found` — Checkpoint not found

---

### GET /api/checkpoints/:id/predict
Pattern-based wait-time forecast for a checkpoint: predicts expected wait minutes for each of the next `horizon` hours by matching hour-of-day patterns over recent reports, bucketed in the airport's local timezone. The two imminent slots are blended with the live crowd consensus (recency-weighted reports from the last hour) so short-lived incidents (lane closure, staffing shortage) surface immediately instead of days later.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Checkpoint UUID |

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `horizon` | number | No | Upcoming hours to forecast (default: 12, max: 24) |
| `days` | number | No | History look-back window in days (default: 30, max: 30) |

**Responses**
- `200 OK` — Forecast object:
  - `checkpointId`, `airportCode`, `airportName`, `code`, `name`, `terminal`, `timezone`
  - `horizon`, `historyDays`: parameters used
  - `sampleCount`: number of reports in the history window
  - `overallAverageMinutes`: average wait across all samples (null when none)
  - `currentConsensusMinutes`: recency-weighted consensus from the last 6h (null when no fresh reports)
  - `liveConsensusMinutes`: recency-weighted consensus from the last 60 minutes (null when no live reports); drives the imminent-slot blending
  - `predictions`: array of `{ hour, forecastFor, predictedMinutes, confidence, sampleCount, source }` for each upcoming hour:
    - `hour`: local hour of day (0-23)
    - `forecastFor`: ISO timestamp of the top of that hour slot
    - `predictedMinutes`: hour-of-day pattern average, or live-blended for the imminent slots (60% live + 40% pattern for the current hour, 30% live + 70% pattern for the next)
    - `confidence`: 0-1, based on sample count (10+ samples = 1.0); blended slots pool hour-of-day history depth plus live corroboration
    - `source`: `"pattern"` (real hour-of-day data), `"fallback"` (overall average at halved confidence, used when the hour has no samples), or `"blended"` (live consensus mixed into the pattern; slots 0-1 only, and only when live reports exist)
    - Live-window reports never double-count: the hour-of-day pattern baseline excludes reports from the last hour
  - `bestHours`: up to 3 quietest upcoming hours backed by pattern and/or live data (`"pattern"` or `"blended"` only), sorted ascending — `{ hour, forecastFor, predictedMinutes }`
  - When `sampleCount` is 0: `predictions` and `bestHours` are empty arrays and stat fields are null
- `400 Bad Request` — Invalid id, `horizon` not in 1-24, or `days` not in 1-30
- `404 Not Found` — Checkpoint not found

---

### GET /api/wait-times/summary
Cross-airport overview for the dashboard landing view: every supported airport with its latest reported wait and a 3h-vs-previous-3h trend direction. Compute-on-read with a 5-minute response cache (`CacheTtlSeconds` metadata included); moderation-hidden reports are excluded and a flag-threshold exclusion invalidates the cache immediately.

**Responses**
- `200 OK` — `{ airportCount, airportsWithData, airports: [...], generatedAt, cacheTtlSeconds }` where each airport entry is `{ airport, airportName, timezone, latestWaitMinutes|null, latestReportedAt|null, sampleSize, trend: { direction: "up"|"down"|"flat"|null, currentAverageMinutes|null, previousAverageMinutes|null, currentSampleSize, previousSampleSize, windowHours } }`
- `500 Internal Server Error` — `{ error: "Database unavailable" }` (never fabricated)

### GET /api/airports/:code/wait-stats
Per-airport wait-time aggregates. Buckets with no reports return null stats (truthful zero data, not zeros).

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `code` | string | 3-letter IATA airport code |

**Responses**
- `200 OK` — `{ airport, airportName, timezone, sampleSize, overall: { averageMinutes|null, p50Minutes|null, p90Minutes|null, sampleSize }, byHourOfDay: [{ hour, ...BucketStats }] (24 elements), byDayOfWeek: [{ day, ...BucketStats }] (7 elements), generatedAt, cacheTtlSeconds }`
- `400 Bad Request` — invalid IATA code format
- `404 Not Found` — unknown airport
- `500 Internal Server Error` — `{ error: "Database unavailable" }`

---

### POST /api/checkpoints/:id/wait-times
Report a wait time for a specific checkpoint.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Checkpoint UUID |

**Request Body**
```json
{
  "minutes": 30,
  "source": "crowd",
  "reportedAt": "2026-05-21T18:00:00.000Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `minutes` | number | Yes | Wait time in minutes (0-300) |
| `source` | string | No | `crowd` (default) or `official` |
| `reportedAt` | string | Yes | ISO 8601 timestamp of the observation |

**Validation**
- `reportedAt` is required and must be a valid ISO date string
- `reportedAt` cannot be older than 30 days
- `reportedAt` cannot be in the future (5 minute clock skew allowed)

**Responses**
- `201 Created` — `{ data: { WaitTime } }`
- `400 Bad Request` — Invalid minutes, missing checkpointId, or invalid reportedAt
- `404 Not Found` — Checkpoint not found
- `429 Too Many Requests` — Rate limit exceeded

**Rate Limiting**
- One report per 30 seconds per session.
- `429` response includes:
```json
{
  "error": "Rate limit exceeded...",
  "retryAfter": 27
}
```

---

### POST /api/reports
Alias for `POST /api/checkpoints/:id/wait-times`. Accepts `checkpointId` in the request body instead of the URL path.

**Request Body**
```json
{
  "checkpointId": "uuid",
  "minutes": 30,
  "source": "crowd",
  "reportedAt": "2026-05-21T18:00:00.000Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `checkpointId` | string | Yes | Checkpoint UUID |
| `minutes` | number | Yes | Wait time in minutes (0-300) |
| `source` | string | No | `crowd` (default) or `official` |
| `reportedAt` | string | Yes | ISO 8601 timestamp |

**Responses**: Same as `POST /api/checkpoints/:id/wait-times`.

**Field Aliases**: Same aliases apply: `waitTimeMinutes` for `minutes`, `timestamp` for `reportedAt`. `lineType` or `reportType` accepted for report type.

---

### DELETE /api/reports/:id
Admin-only deletion of a single wait-time report. Used for QA/test-record
cleanup in production. This is the canonical delete path — there is no other.

Fail-closed: if the server has no `ADMIN_API_KEY` configured, the endpoint is
disabled (`503`) rather than open. Auth is checked before any validation or
lookup so unauthenticated callers learn nothing about report ids. Successful
deletions emit a structured `report_deleted` audit log line. Deletion takes
effect immediately in all derived views (`GET /api/checkpoints`,
`GET /api/checkpoints/:id`, airport endpoints) since wait times are computed
from the database on read.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Report UUID (as returned by `POST /api/reports` → `data.id`) |

**Headers** (one of the following, required)
- `X-Admin-Key: <ADMIN_API_KEY>` (canonical)
- `Authorization: Bearer <ADMIN_API_KEY>`

**Responses**
- `204 No Content` — Report deleted
- `400 Bad Request` — Invalid report id format
- `401 Unauthorized` — Missing or incorrect admin key
- `404 Not Found` — Well-formed id that does not exist (including already-deleted)
- `503 Service Unavailable` — `ADMIN_API_KEY` not configured on the server

**Example**
```bash
curl -X DELETE "https://flyby-api.onrender.com/api/reports/<report-id>" \
  -H "X-Admin-Key: $ADMIN_API_KEY"
```

**Audit log format** (single JSON line per deletion):
```json
{
  "event": "report_deleted",
  "timestamp": "2026-09-22T09:14:00.000Z",
  "reportId": "uuid",
  "checkpointId": "uuid",
  "minutes": 25,
  "source": "crowd",
  "reportType": "standard",
  "reportedAt": "2026-09-22T09:10:00.000Z",
  "ip": "203.0.113.10"
}
```

---

### POST /api/reports/:id/flag
Flag a wait-time report as abusive/inaccurate (crowdsourced abuse control).
Each session may flag a given report once (`409` on repeat). When a report
accumulates **3** flags from distinct sessions it is excluded from every
traveler-facing computation: checkpoint lists, history, stats, forecasts,
SSE "latest" payloads, dashboard aggregates, and notification baselines.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Report UUID (as returned by `POST /api/reports` → `data.id`) |

**Headers**
- `X-Session-Id: <session-id>` — required unless `sessionId` is passed in the body. Same session convention as report submission.

**Request Body**
```json
{
  "reason": "inaccurate",
  "note": "checkpoint closed tonight",
  "sessionId": "optional-if-header-used"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | Yes | One of `wrong_location`, `inaccurate`, `spam`, `other` |
| `note` | string | No | Free text, max 200 characters |
| `sessionId` | string | No | Alternative to the `X-Session-Id` header |

**Responses**
- `201 Created` — `{ "data": { "flagId", "reportId", "flagCount", "excluded" } }` (`excluded: true` when this flag pushed the report past the hide threshold)
- `400 Bad Request` — Invalid id format, missing/invalid `reason`, note too long, or no session id
- `404 Not Found` — Report does not exist
- `409 Conflict` — This session has already flagged this report

Every accepted flag emits a structured `report_flagged` audit log line.

---

### GET /api/reports/flagged
Moderation queue: all reports with at least one flag, worst first. Currently
unauthenticated (to be admin-protected once user accounts land — see MVP #8).

**Responses**
- `200 OK` — `{ "data": [ { "id", "checkpointId", "checkpointCode", "checkpointName", "airportCode", "airportName", "minutes", "source", "reportType", "reportedAt", "flagCount", "excluded", "flags": [ { "id", "reason", "note", "createdAt" } ] } ] }`

---

### GET /api/checkpoints/airport/:code
Get all checkpoints for an airport by IATA code, with aggregated wait times.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `code` | string | Airport IATA code (e.g., `JFK`) |

**Responses**
- `200 OK` — Array of checkpoint objects with wait times (up to 30 per checkpoint)
- `400 Bad Request` — Invalid airport code format
- `404 Not Found` — Airport not found

**Note**: Also accessible via `GET /api/checkpoints/:id` when `:id` is a 3-letter IATA code.

---

### GET /api/checkpoints/airport/:code/live
SSE endpoint for real-time wait time updates for all checkpoints at an airport.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `code` | string | Airport IATA code (e.g., `JFK`) |

**Event Payload**: Includes `checkpointId` to identify which checkpoint was updated.

**Responses**
- `200 OK` — SSE stream starts with initial data for all checkpoints
- `400 Bad Request` — Invalid airport code
- `404 Not Found` — Airport not found

---

### GET /api/checkpoints/:id/stream
SSE endpoint for real-time wait time updates for a specific checkpoint.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Checkpoint UUID |

**Responses**
- `200 OK` — SSE stream starts
- `404 Not Found` — Checkpoint not found
- `500 Internal Server Error` — Failed to start stream

---

### GET /api/checkpoints/stream
SSE endpoint for real-time wait time updates for ALL checkpoints (global stream).

**Responses**
- `200 OK` — SSE stream starts with events for all checkpoint updates
- `500 Internal Server Error` — Failed to start stream

**Event Payload Format**
Each event includes the `checkpointId` to identify which checkpoint was updated:
```json
{
  "checkpointId": "uuid",
  "minutes": 25,
  "source": "crowd",
  "reportedAt": "2026-05-21T18:00:00.000Z"
}
```

---

### GET /api/me
Get the current anonymous session.

**Headers**
- `X-Session-Id` (optional): A client-provided session identifier

**Responses**
- `200 OK` — Session object:
```json
{
  "data": {
    "id": "anon-...",
    "createdAt": "2026-05-21T...",
    "reportsSubmitted": 0
  }
}
```

---

### PATCH /api/me
Update the current session's nickname.

**Headers**
- `X-Session-Id` (optional)

**Request Body**
```json
{
  "nickname": "Traveler123"
}
```

**Responses**
- `200 OK` — Updated session object

---

### POST /v1/auth/signup
Create a new user account.

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "secure-password",
  "displayName": "Jane Traveler"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Valid email address |
| `password` | string | Yes | Min 6 characters |
| `displayName` | string | No | Display name for the profile |

**Responses**
- `201 Created` — `{ data: { user, token } }`
- `400 Bad Request` — Missing/invalid fields, email already registered
- `409 Conflict` — Email already in use

---

### POST /v1/auth/login
Authenticate with email and password.

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

**Responses**
- `200 OK` — `{ data: { user, token } }`
- `401 Unauthorized` — Invalid email or password

---

### GET /v1/auth/me
Get the currently authenticated user's profile.

**Headers**
- `Authorization: Bearer <token>`

**Responses**
- `200 OK` — `{ data: { id, email, displayName, isPremium, createdAt, reportCount } }`
- `401 Unauthorized` — Missing or invalid token

---

### GET /v1/auth/me/reports
Get the authenticated user's submitted wait time reports.

**Headers**
- `Authorization: Bearer <token>`

**Responses**
- `200 OK` — `{ data: [{ id, checkpointId, minutes, source, reportType, reportedAt, checkpoint }] }`
- `401 Unauthorized` — Missing or invalid token

---

### POST /v1/auth/link-session
Link anonymous session reports to an authenticated user account.

**Headers**
- `X-Session-Id` (anonymous session identifier)

**Request Body**
```json
{
  "sessionId": "anon-..."
}
```

**Responses**
- `200 OK` — `{ data: { linkedCount: 5 } }`
- `400 Bad Request` — Missing session ID

---

## Push Notifications

The notification subsystem crowdsources wait-time alerts: clients subscribe
via Web Push, and the server evaluates incoming reports against per-user
alert conditions. Auto-trigger fires automatically on every
`POST /api/checkpoints/:id/wait-times` (gated by `FLYBY_AUTO_NOTIFICATIONS`
env, default enabled); the explicit `/api/notifications/send` endpoint is the
operator/admin path.

### GET /api/notifications/vapid-public-key
Return the VAPID public key the client uses for service worker push registration.

**Responses**
- `200 OK` — `{ publicKey: "<base64url>" }`

---

### POST /api/notifications/subscribe
Register a Web Push subscription for an airport. Anonymous (logged-out)
subscribers are accepted — they have no DND preference row and are never
auto-muted. An optional `Authorization: Bearer <token>` associates the
subscription with the authenticated user.

**Request Body**
```json
{
  "endpoint": "https://updates.push.services.mozilla.com/...",
  "keys": { "p256dh": "...", "auth": "..." },
  "airportId": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | Yes | Web Push endpoint URL (browser push service) |
| `keys.p256dh` | string | Yes | Web Push ECDH public key |
| `keys.auth` | string | Yes | Web Push auth secret |
| `airportId` | string | Yes | Airport UUID to subscribe to |

**Responses**
- `201 Created` — `{ data: { id, airportId, createdAt } }`
- `400 Bad Request` — Missing fields or malformed body
- `404 Not Found` — Airport not found

---

### DELETE /api/notifications/subscriptions/:id
Cancel a Web Push subscription. If the subscription was created under a
user account, the Bearer token must belong to the same user.

**Path Parameters**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Subscription UUID |

**Headers**
- `Authorization: Bearer <token>` (required only for subscriptions owned by a user)

**Responses**
- `200 OK` — `{ data: { id } }`
- `401 Unauthorized` — Subscription owned by a user but no/invalid token
- `403 Forbidden` — Token does not own this subscription
- `404 Not Found` — Subscription does not exist

---

### GET /api/notifications/subscriptions
List the authenticated user's active push subscriptions.

**Headers**
- `Authorization: Bearer <token>` (required)

**Responses**
- `200 OK` — `{ data: [{ id, endpoint, airportId, airportCode, airportName, createdAt }] }`
- `401 Unauthorized` — Missing or invalid token

---

### GET /api/notifications/preferences
Return the authenticated user's alert preferences. A row with spec defaults
is auto-created on first GET (idempotent get-or-create).

**Headers**
- `Authorization: Bearer <token>` (required)

**Responses**
- `200 OK` — `{ data: { dndEnabled, dndStartHour, dndEndHour, thresholdMinutes, spikePercent, leaveNowPercent } }`
- `401 Unauthorized` — Missing or invalid token

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dndEnabled` | boolean | `true` | Whether Do Not Disturb is active |
| `dndStartHour` | int 0–23 | `22` | DND quiet hours start (local airport-side hour) |
| `dndEndHour` | int 0–23 | `6` | DND quiet hours end; if `start === end` DND is disabled; if `start > end` the window wraps past midnight |
| `thresholdMinutes` | int 1–120 | `30` | Alert when wait exceeds this many minutes |
| `spikePercent` | int 1–500 | `100` | Alert when wait jumps at least this percent vs. the previous report |
| `leaveNowPercent` | int 100–300 | `150` | Leave-now multiplier over the 24h historical average, as a percent (150 = 1.5×; lower is more sensitive) |

---

### PATCH /api/notifications/preferences
Partially update the authenticated user's alert preferences. Only the
supplied fields are modified; omitted fields retain existing values.
Auto-creates the preference row with spec defaults when none exists.

**Headers**
- `Authorization: Bearer <token>` (required)

**Request Body** (any subset)
```json
{
  "dndEnabled": false,
  "dndStartHour": 23,
  "dndEndHour": 5,
  "thresholdMinutes": 45,
  "spikePercent": 150,
  "leaveNowPercent": 180
}
```

**Responses**
- `200 OK` — `{ data: { ...updated prefs } }`
- `400 Bad Request` — `{ error, details: ["dndEnabled must be a boolean", ...] }`
- `401 Unauthorized` — Missing or invalid token

**Validation**
- `dndEnabled` must be a boolean.
- `dndStartHour`, `dndEndHour` must be integers 0–23 inclusive. Wrap-around
  (`start > end`) is allowed and represents a window crossing midnight.
  `start === end` is allowed and effectively disables DND.
- `thresholdMinutes` must be an integer 1–120.
- `spikePercent` must be an integer 1–500.
- `leaveNowPercent` must be an integer 100–300 (100 = 1.0×, 150 = 1.5×, 300 = 3.0×).

---

### POST /api/notifications/send
Admin/operator endpoint: evaluate alert conditions for an airport and
dispatch a Web Push notification to every subscriber, subject to DND and
per-subscription rate limiting (`ALERT_RATE_LIMIT_MINUTES` = 60 min).
This endpoint also backs the automatic trigger invoked from
`POST /api/checkpoints/:id/wait-times`; not intended for direct traveler use.

**Request Body**
```json
{
  "airportId": "uuid",
  "checkpointId": "uuid",
  "minutes": 45,
  "force": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `airportId` | string | Yes | Airport UUID |
| `checkpointId` | string | No | Checkpoint UUID; resolvers attach name to the push body |
| `minutes` | number | Yes | Current wait minutes (>= 0) |
| `force` | boolean | No | Bypass DND + rate-limit (admin only) |

**Responses**
- `200 OK` — `{ sent, skipped, reasons, decision, alertType, suggestedDepartureMinutes }`
- `400 Bad Request` — Missing/invalid `airportId` or `minutes`
- `404 Not Found` — Airport or checkpoint not found

**Alert types** (returned as `alertType`):
- `threshold` — wait exceeded `thresholdMinutes`
- `spike` — wait jumped >= `spikePercent` within `ALERT_SPIKE_WINDOW_MINUTES` (15 min)
- `leave_now` — wait exceeds the 24h historical average by the `leaveNowPercent` multiplier (default 150 = 1.5×; suggests a departure time)

**Per-subscriber evaluation (important).** When `dispatchWaitTimeAlerts` fans out
to subscribers, `evaluateAlert` is re-run for **each** subscriber using that
subscriber's own `NotificationPreference.thresholdMinutes`, `spikePercent`,
and `leaveNowPercent`. The `threshold`, `spike`, and `leave_now` alert types
are therefore gated independently per subscriber — a user who raised their
`thresholdMinutes` slider to 60 will not receive a `threshold` alert for a
45-min report, and a user who raised their `leaveNowPercent` slider to 300
(3.0×) will not receive a `leave_now` alert until the current wait exceeds
3× the 24h historical average, while a default-preference subscriber to the
same airport will receive the alert at the default 1.5× bar. The baseline
`decision`/`alertType` echoed on the response payload always reflects the
spec-default (150) `leaveNowPercent`.

The `decision`, `alertType`, and `suggestedDepartureMinutes` echoed on the
response payload reflect the **baseline** (spec-default) evaluation for
backward compatibility with operator callers expecting a single summary. The
actual per-subscriber outcome is recorded in the NotificationLog rows written
per subscriber; the `reasons` array surfaces `eval-skip:<subId>:<reason>`
entries for subscribers whose own thresholds suppressed the alert, plus the
existing `dnd:` / `rate-limited:` / `send-failed:` reasons.

Anonymous subscribers (no auth token) have no preference row; `getPreference(null)`
returns `dndEnabled:false` and the spec-default `thresholdMinutes`/`spikePercent`/`leaveNowPercent`,
so the alert is evaluated against the spec defaults without DND.