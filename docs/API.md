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
| GET    | `/api/airports` | `200 {"airports":[{id,code,name,city}]}` — optional `?q=` filters by code/city/name    |
| GET    | `/api/airports/:code` | `200 {id,code,name,city}` — accepts either the code (`JFK`) or the id (`apt-jfk`); unknown airport `404 {"errors":[{field:"code",message}]}` |

Supported airports: JFK, SEA, LAX, ORD, SFO (mirrors `apps/web/src/data/airports.ts`).

## Checkpoints

| Method | Path               | Response                                                                                     |
| ------ | ------------------ | -------------------------------------------------------------------------------------------- |
| GET    | `/api/checkpoints` | `200 {"checkpoints":[{airport,name}]}` — optional `?airport=<CODE\|apt-id>` or `?airportId=<CODE\|apt-id>` filters |

Unknown airport in `?airport=`/`?airportId=` returns `404 {"errors":[{field:"airport",message}]}`.

## Wait times

| Method | Path                    | Response                                                                                       |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/wait-times`       | `200 [{airport,checkpoint,waitMinutes,updatedAt}]` — optional `?airport=<CODE\|apt-id>` or `?airportId=<CODE\|apt-id>` (case-insensitive). Known airports with no reports return `200 []`. Unknown airports return `404 {"error":"Airport not found"}`. Records are never fabricated (TIR-298). |
| POST   | `/api/wait-times`       | `201 {id,...body,waitMinutes,receivedAt}`; body `{airport:string, checkpoint?:string, waitMinutes:positive int}`. Validation errors: `400 {"errors":[...]}`. Rate limit: 30s per user/IP → `429` with `Retry-After`. Alias: `POST /api/wait-times/report` |

## Subscriptions (push notifications)

| Method | Path                          | Response                                                                                          |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/api/subscriptions`          | `200/201` flat subscription `{id,endpoint,airportId,airportCode,userId,createdAt,updatedAt}` (aliases: `/api/notifications/subscribe`, `/api/push/subscribe`). Required: endpoint,p256dh,auth,airportId → `400 {"errors":[...]}` |
| GET    | `/api/subscriptions`          | `200 {"subscriptions":[...]}` (flat rows, p256dh/auth redacted — push credentials are not publicly enumerable) |
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

## Push

| Method | Path                                    | Response                                                                                  |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/api/notifications/vapid-public-key`   | `200 {publicKey}` (aliases: `/api/push/vapid-public-key`, `/api/push/vapidPublicKey`, `/api/vapid-public-key`) |
| POST   | `/api/notifications/trigger`            | `200 {sent,messageId,payload,deliveredTo}`; body `{subscriptionId, payload:{title,body,data?}}`; validation `400 {"errors":[...]}` (aliases: `/api/push/trigger`, `/api/notifications/test`) |

## Metrics

| Method | Path           | Response                                                                                             |
| ------ | -------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/api/metrics` | `200 {service,status,startedAt,uptimeSeconds,sseClients,memory:{rssMB,heapUsedMB},timestamp}`        |
