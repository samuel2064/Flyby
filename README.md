# Flyby

Flyby — a crowdsourced airport security checkpoint wait-time tracker for travelers.

The app shows live security wait times at every major airport checkpoint, updated every few minutes through crowdsourced traveler reports and pattern-matching algorithms.

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, PWA
- **Backend:** Node.js, Express, REST API, Prisma ORM
- **Database:** SQLite (dev) / PostgreSQL (prod)
- **Cache:** Redis (session + SSE pub/sub)
- **Testing:** Vitest + Supertest

## Development

### Prerequisites

- Node.js >= 20
- Redis (for SSE functionality)

### Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Seed database
npm run db:seed
```

### Local dev without Docker (verified 2026-09-18, TIR-267)

No Docker or external services are required. The API uses a file-based SQLite
datasource and an in-process Redis mock.

`packages/api/.env` must contain:

```
DATABASE_URL="file:./prisma/dev.db"   # resolved relative to packages/api/prisma -> packages/api/prisma/prisma/dev.db
MOCK_REDIS=1                          # in-process Redis stub; no Redis server needed
PORT=3001                             # any free port
NODE_ENV=development
```

Then from the repo root: `npm install`, `npm run db:generate`, `npm run db:seed`
(if `dev.db` does not exist yet), `npm run dev:api`.

Verify: `curl http://localhost:<PORT>/api/health` should return
`{"status":"ok",...,"services":{"database":"ok","redis":"ok"}}` and
`curl http://localhost:<PORT>/api/checkpoints` returns seeded checkpoint data.

Gotchas:

- If port 3001 is in use, prefix the command with a different `PORT` (e.g.
  `set PORT=3101 && npm run dev` on Windows or `PORT=3101 npm run dev` on
  POSIX). The health and data endpoints work identically on any port.
- Never point `DATABASE_URL` at the production PostgreSQL instance for local
  iteration. Live route contracts at https://flyby-api.onrender.com remain the
  authoritative reference for deployed behavior.

### Running Locally

```bash
# Start both frontend and backend
npm run dev

# Or start individually
npm run dev:api   # Backend on http://localhost:3001
npm run dev:web   # Frontend on http://localhost:5173
```

### Testing

```bash
# Run all tests (backend + frontend + e2e config regression tests)
npm test

# Run backend tests only
npm test --workspace=packages/api

# Run frontend tests only
npm test --workspace=packages/web

# Run E2E tests (Playwright boots both API and web servers automatically)
npm run test:e2e

# Run with coverage
npm run test:coverage
```

> **Port conflicts:** The E2E suite defaults to API port 3001 and web port 3000.
> If those are occupied by unrelated local processes, override them without
> touching the squatters: `E2E_API_PORT=3199 E2E_WEB_PORT=3299 npm run test:e2e`
> (PowerShell: `$env:E2E_API_PORT="3199"; $env:E2E_WEB_PORT="3299"; npm run test:e2e`).
> The web dev server's `/api` proxy follows `E2E_API_PORT` automatically.

### Test Coverage

- **Backend:** 717 tests (API endpoints, SSE, seed logic, auth, me, waitTimeUtils, float validation, edge cases, middleware, error handling, input validation, rate limits, notifications, wait-time reporting, notifications preferences auto-trigger, per-subscriber dispatch, agents, checkpoint stats, pattern-based wait-time forecast incl. live blending, batched airport forecasts, admin report deletion, one-row-per-checkpoint latest-report-wins semantics, report abuse flagging, wait-time aggregation/summary, deploy-compat traveler + QA alias surfaces)
- **Frontend:** 377 tests (components, offline queue, error boundary, rate limit, airport incl. per-checkpoint best-time-today forecast chips, dashboard, search, login, signup, useApi, useDebounce, useApiMutation, NotFound, useSse, ProtectedRoute, Skeleton, Profile, AuthContext, Checkpoint incl. Forecast section (live-adjusted badges), useRefreshInterval, useOfflineQueue, NotificationPreferences, usePushNotification)
- **E2E:** 20 Playwright tests for critical user flows (home, search, airport-detail, report-wait-time, auth, forecast chips) + 2 Playwright config port-override regression tests
- **Total:** 1116 tests passing (100%) — verified 2026-09-26
- **Coverage Threshold:** 70% (statements, branches, functions, lines)
- **Actual Coverage:** Backend 90.78% statements / 86.2% branches, Frontend 90.41% statements / 84.18% branches (verified 2026-09-20)

### Database Commands

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed
```

## Project Structure

```
flyby/
├── packages/
│   ├── api/          # Backend API (Express + Prisma)
│   │   ├── src/      # Source code
│   │   ├── tests/    # API tests
│   │   └── prisma/   # Database schema & migrations
│   └── web/          # Frontend PWA (React + Vite)
│       ├── src/      # Source code
│       └── tests/    # Component tests
├── docs/             # Documentation
│   ├── API.md        # API specification
│   ├── DBSCHEMA.md   # Database schema
│   └── MVP-FEATURES.md
└── .github/
    └── workflows/    # CI/CD pipelines
```

## API Documentation

See [docs/API.md](docs/API.md) for complete API specification.

### Key Endpoints

- `GET /api/airports` - Search airports
- `GET /api/checkpoints` - List all checkpoints with wait times
- `POST /api/checkpoints/:id/wait-times` - Report a wait time
- `GET /api/checkpoints/stream` - SSE stream for real-time updates

## Features

### MVP Features (Completed)

- ✅ Airport search (by code, city, geospatial)
- ✅ Airport detail pages with checkpoints
- ✅ Checkpoint list with live wait times
- ✅ Report wait times (with rate limiting)
- ✅ Real-time SSE updates
- ✅ Offline report queue with auto-sync
- ✅ Offline status indicators
- ✅ Error boundary (catch-all crash protection)
- ✅ Skeleton loading states
- ✅ Rate limit feedback with countdown timer
- ✅ useApi, useDebounce, useApiMutation hooks
- ✅ 404 Not Found page
- ✅ Geolocation-based nearby airport search
- ✅ Login & signup with JWT token storage

### Premium Features (Planned)

- Real-time push notifications
- Personalized journey planning
- Ad-free experience

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

## License

MIT