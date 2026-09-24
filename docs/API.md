# Flyby API

Base URL (production): `https://flyby-api.onrender.com`

All responses are JSON. Unknown `/api/*` routes return `404 {"error":"not_found","path":...}`.
Malformed JSON bodies return `400 {"error":"bad_request"}`.

## Health

| Method | Path          | Response                                                      |
| ------ | ------------- | ------------------------------------------------------------- |
| GET    | `/api/health` | `200 {"status":"ok","timestamp","service":"flyby-api"}`       |

## Airports

| Method | Path           | Response                                                                                |
| ------ | -------------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/airports` | `200 {"airports":[{id,code,name,city,timezone}]}` — all 51 supported airports (TIR-313); optional `?q=` filters by code/city/name    |
| GET    | `/api/airports/:code` | `200 {id,code,name,city,timezone}` — accepts either the code (`JFK`) or the id (`apt-jfk`); unknown airport `404 {"errors":[{field:"code",message}]}` |

Supported airports: 51 major US airports (JFK, SEA, LAX, ORD, SFO, ATL, DEN, LAS, MCO, ... full list in `data/airports.json`, the single source shared by the API and `apps/web`).

## Checkpoints

| Method | Path               | Response                                                                                     |
| ------ | ------------------ | -------------------------------------------------------------------------------------------- |
| GET    | `/api/checkpoints` | `200 {"checkpoints":[{airport,name}]}` — 164 checkpoints across 51 airports; optional `?airport=<CODE\|apt-id>` or `?airportId=<CODE\|apt-id>` filters |

Unknown airport in `?airport=`/`?airportId=` returns `404 {"errors":[{field:"airport",message}]}`.

## Forecasts (TIR-300)

| Method | Path                            | Response |
| ------ | ------------------------------- | -------- |
| GET    | `/api/checkpoints/:id/predict`  | `200 {data:{checkpointId,airportCode,airportName,code,name,terminal,historyDays,horizon,timezone,sampleCount,overallAverageMinutes,currentConsensusMinutes,liveConsensusMinutes,predictions:[...],bestHours:[...]}}` |
| GET    | `/api/airports/:code/forecasts` | `200 {data:{airportCode,airportName,timezone,historyDays,horizon,forecasts:[{checkpointId,code,name,terminal,timezone,sampleCount,overallAverageMinutes,currentConsensusMinutes,liveConsensusMinutes,predictions:[...],bestHours:[...]}]}}` — batched: one call forecasts every checkpoint at the airport |

Both accept `?horizon=<1-24>` (default 12) and `?days=<1-30>` (default 30). Invalid values return
`400 {"error":"<horizon\|days> must be a positive integer between <min> and <max>"}`.

- Checkpoint ids are deterministic slugs `ck-<airport code>-<name>` (e.g. `ck-jfk-main`); the same
  ids appear in the batch `forecasts` array. Malformed id → `400 {"error":"Invalid checkpoint id"}`;
  unknown id → `404 {"error":"Checkpoint not found"}`. Invalid airport code format →
  `400 {"error":"Invalid airport code. Must be a 3-letter IATA code."}`; unknown airport →
  `404 {"error":"Airport not found"}`.
- `predictions` covers the next `horizon` local hours: `{hour, forecastFor, predictedMinutes,
  confidence, sampleCount, source}` where `source` is `pattern` (hour-of-day history), `fallback`
  (no history for that hour — overall average at halved confidence), or `blended` (live
  crowd-consensus mixed into the two imminent slots: 60% live + 40% pattern for the current hour,
  30% + 70% for the next). Live-window reports never double-count into the pattern baseline.
- `bestHours` is the top 3 upcoming hours backed by real pattern/live data, sorted by predicted
  wait (best time to go).
- Checkpoints with no reports in the window return `sampleCount: 0` with EMPTY
  `predictions`/`bestHours` — values are never fabricated (TIR-298 trust principle).
- DB read failures answer `500 {"error":"Database unavailable"}` — never a fabricated forecast.
- Hour bucketing uses the airport's local timezone (`America/New_York` for JFK, etc.).

## Checkpoint history (chart)

| Method | Path                             | Response |
| ------ | -------------------------------- | -------- |
| GET    | `/api/checkpoints/:id/history`   | `200 {data:{checkpointId,airportCode,airportName,name,windowHours,bucketMinutes,reportCount,history:[{time,minutes,count}]}}` |

Rolling wait-time history for a checkpoint, from **real reports only** — powers the per-checkpoint
historical chart (MVP feature #6).

- Accepts `?window=<1-24>` (hours, default 4) and `?bucket=<5\|10\|15\|30\|60>` (minutes, default 30).
  Invalid values return `400 {"error":"<window\|bucket> must be a positive integer between <min> and <max>"}`;
  a well-formed but unsupported bucket size returns `400 {"error":"bucket must be one of: 5, 10, 15, 30, 60"}`.
- `history` is ascending by bucket start time; buckets are epoch-aligned multiples of `bucket`
  minutes and each point is the rounded average of the reports in that bucket (`count` = reports
  per bucket).
- No fabrication: a checkpoint without reports in the window returns `history: []`,
  `reportCount: 0`. DB read failures answer `500 {"error":"Database unavailable"}`.
- Id validation matches the forecast endpoints: malformed id → `400 {"error":"Invalid checkpoint id"}`;
  unknown id → `404 {"error":"Checkpoint not found"}`.


## Wait times

| Method | Path                    | Response                                                                                       |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/wait-times`       | `200 [{airport,checkpoint,waitMinutes,updatedAt}]` — optional `?airport=<CODE\|apt-id>` or `?airportId=<CODE\|apt-id>` (case-insensitive). Known airports with no reports return `200 []`. Unknown airports return `404 {"error":"Airport not found"}`. Records are never fabricated (TIR-298). |
| POST   | `/api/wait-times`       | `201 {id,airport,checkpoint,waitMinutes,receivedAt}`; body `{airport:string, checkpoint?:string, waitMinutes:1-300}`. Unknown airports are rejected at the boundary: `404 {"error":"Airport not found"}` (TIR-314 — no residue to purge later). Validation errors: `400 {"errors":[...]}`. Rate limit: 30s per user/IP → `429` with `Retry-After`. Alias: `POST /api/wait-times/report` |

## Reports (admin)

| Method | Path                   | Response                                                                                                                                    |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| DELETE | `/api/reports/:id`     | `204` on success. Auth required: `X-Admin-Key: <ADMIN_API_KEY>` or `Authorization: Bearer <ADMIN_API_KEY>`. Missing/wrong key → `401 {"error":"Invalid or missing admin key"}`. Invalid id format → `400 {"error":"Invalid report id"}`. Unknown id → `404 {"error":"Report not found"}`. If `ADMIN_API_KEY` is not configured server-side → `503` (deletion disabled, fail-closed). |

Intended for QA/test-record cleanup in production. Every successful deletion emits a
single-line JSON audit log (`event: "report_deleted"` with reportId, airport, checkpoint,
waitMinutes, reporter, reportedAt, ip) visible in the Render log drain. Deletion is a hard
delete; ids are the `rpt_<epoch-ms>` values returned by `POST /api/wait-times`.

## Subscriptions (push notifications)

| Method | Path                          | Response                                                                                          |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/api/subscriptions`          | `200/201` redacted subscription `{id,airportId,airportCode,createdAt,updatedAt}` (aliases: `/api/notifications/subscribe`, `/api/push/subscribe`). Required: endpoint,p256dh,auth,airportId → `400 {"errors":[...]}` |
| GET    | `/api/subscriptions`          | `200 {"subscriptions":[...]}` — REDACTED rows only: no `endpoint` (bearer push credential), no `userId`, no `p256dh`/`auth`. Public responses must never expose them (TIR-294/TIR-309). |
| DELETE | `/api/notifications/:id`      | `200 {"success":true,id}`; unknown id `404`; other user's subscription `403`                      |
| GET    | `/api/notifications/:userId`  | `200 {subscriptions,total,page,pageSize}` (paginated, `?page=&pageSize=`, p256dh/auth redacted)   |

Per-user limit: 10 subscriptions (non-anonymous).

## Preferences

| Method | Path                                    | Response                                                       |
| ------ | --------------------------------------- | -------------------------------------------------------------- |
| GET    | `/api/notifications/preferences`        | `200 {enabled,airports,minWaitChange}` (aliases: `/api/notifications/prefs`, `/api/preferences`) |
| PUT    | `/api/notifications/preferences`        | `200` updated prefs                                            |
| GET    | `/api/notifications/preferences/:userId`| `200 {userId,dndStart,dndEnd,thresholdMinutes,frequency,enabled,updatedAt}`; unknown user `404` |
| PATCH  | `/api/notifications/preferences/:userId`| `200` updated prefs; validation errors `400 {"errors":[...]}`  |

## Live events (SSE)

| Method | Path                                          | Response                                              |
| ------ | --------------------------------------------- | ----------------------------------------------------- |
| GET    | `/api/events` (aliases `/api/wait-times/stream`, `/api/sse`) | `200 text/event-stream` (connect + wait-time-update frames) |

`?airport=<CODE>` filters the stream to that airport. Frames: `{"type":"connected","timestamp"}` on
open, then `{"type":"wait-time-update","airport","checkpoint","waitMinutes","timestamp"}` — one per
**accepted report** (`POST /api/wait-times`), fanned out to the clients subscribed to that airport
(and to clients without a filter). A `: ping` keepalive comment is sent every ~20s so proxies keep
the connection open; it is invisible to `EventSource`. Nothing is ever synthesized: a stream with no
reports stays quiet — no fabricated values (TIR-314, same trust principle as TIR-298).

## Push

| Method | Path                                    | Response                                                                                  |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/api/notifications/vapid-public-key`   | `200 {publicKey}` (aliases: `/api/push/vapid-public-key`, `/api/push/vapidPublicKey`, `/api/vapid-public-key`) |
| POST   | `/api/notifications/trigger`            | `200 {sent,messageId,payload,deliveredTo}`; body `{subscriptionId, payload:{title,body,data?}}`; validation `400 {"errors":[...]}` (aliases: `/api/push/trigger`, `/api/notifications/test`) |

## Metrics

| Method | Path           | Response                                                                                             |
| ------ | -------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/api/metrics` | `200 {service,status,startedAt,uptimeSeconds,sseClients,memory:{rssMB,heapUsedMB},timestamp}`        |
