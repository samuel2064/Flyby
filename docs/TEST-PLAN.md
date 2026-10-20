# Flyby MVP Test Plan

## 1. Overview & Scope

| Property | Details |
|----------|---------|
| **Project** | Flyby — crowdsourced airport security checkpoint wait-time tracker |
| **Phase** | MVP |
| **Tech Stack** | React 19 + Vite + Tailwind CSS (PWA) — Node.js + Express + Prisma + PostgreSQL + Redis |
| **Test Tooling** | Vitest (unit + integration), supertest (API), @testing-library/react (UI), Playwright (E2E) |
| **Goal** | 80% confidence that 80% of wait-time reports are within 5 minutes of actual |

### What We Test
- **Backend API** — all public endpoints, error handling, validation
- **Frontend PWA** — pages, components, state, routing, PWA features
- **Wait-Time Accuracy** — consensus model, historical patterns, data quality
- **Integration** — API ↔ DB ↔ Frontend
- **PWA / Mobile** — service worker, offline mode, install prompt, responsiveness
- **Performance** — slow networks, cold starts, render speed

### What We Do NOT Test (MVP scope)
- User authentication / authorization
- Payment flows
- Third-party integrations (other than geolocation)
- Admin dashboard

---

## 2. Test Levels & Strategy

| Level | Tool | When | Coverage Target |
|-------|------|------|-----------------|
| **Unit** | Vitest | Pre-commit | 70% statement |
| **Integration** | Vitest + supertest + in-memory Prisma | On PR | 60% API routes |
| **E2E** | Playwright | Nightly | 6 critical user journeys |
| **Manual QA** | Checklist | Before release | 100% of checklist items |

### Automation Strategy
1. **Unit tests**: Fast, isolated, run on every push. Mock all external deps (DB, Redis, fetch).
2. **Integration tests**: Run against a test DB (separate PostgreSQL schema via `DATABASE_URL`).
3. **E2E tests**: Spin up the full app (`npm run dev`) and simulate real user flows.
4. **CI**: Run unit + integration on every PR. E2E on nightly schedule.

---

## 3. Backend API Test Plan

### 3.1 Health Check

| Test | Method | Expected |
|------|--------|----------|
| Health returns 200 OK | `GET /health` | `{ ok: true }` |

### 3.2 Airport Search (`GET /api/airports/search?q={query}`)

| ID | Test | Expected |
|----|------|----------|
| SEARCH-001 | Missing `?q` → 400 | `400` with clear error |
| SEARCH-002 | `q` < 2 chars → 400 | `400` with validation message |
| SEARCH-003 | `q` = "jfk" → returns JFK | JFK is first result, exact match scored highest |
| SEARCH-004 | `q` = "new york" → returns JFK, LGA, EWR | Results match by name, city, or code |
| SEARCH-005 | Case-insensitive matching | "jfk" and "JFK" return same results |
| SEARCH-006 | SQL injection in query → safe | No 500 or leaked schema |
| SEARCH-007 | Large result set capped at 20 | `data.length <= 20` |
| SEARCH-008 | Non-matching query → empty array | `data: []` with 200 status |

### 3.3 Airport Detail (`GET /api/airports/:code`)

| ID | Test | Expected |
|----|------|----------|
| DETAIL-001 | Valid code (JFK) → 200 with checkpoints | `data.checkpoints.length > 0` |
| DETAIL-002 | Invalid code → 404 | `{ error: "Airport not found" }` |
| DETAIL-003 | Case-insensitive (jfk/JFK) → same | Both return valid airport |
| DETAIL-004 | Checkpoints include latest wait time | `latestWaitTimeMinutes` is a number or null |
| DETAIL-005 | Empty wait time history → null fields | `latestWaitTimeMinutes: null` |
| DETAIL-006 | Include report source (crowd/pattern/official) | `source` matches enum |

### 3.4 Checkpoints List (`GET /api/checkpoints`)

| ID | Test | Expected |
|----|------|----------|
| LIST-001 | Returns all checkpoints | `data` is an array, length > 0 |
| LIST-002 | Each has latest wait time | `latestWaitTimeMinutes` is a number or null |
| LIST-003 | Sorted by name ascending | `data[0].name <= data[1].name` |
| LIST-004 | Capped at 100 | `data.length <= 100` |
| LIST-005 | Includes airport code and name | `airportCode`, `airportName` present |

### 3.5 Report Wait Time (`POST /api/checkpoints/:id/wait-times`)

| ID | Test | Expected |
|----|------|----------|
| REPORT-001 | Valid minutes → 201 created | `{ data: { id, minutes, source, ... } }` |
| REPORT-002 | Negative minutes → 400 | `{ error: "Invalid wait time..." }` |
| REPORT-003 | Minutes > 300 → 400 | 400 with validation error |
| REPORT-004 | Non-numeric minutes → 400 | 400 |
| REPORT-005 | Missing minutes → 400 | 400 |
| REPORT-006 | Invalid checkpoint ID → 500/404 | Graceful error, no crash |
| REPORT-007 | Source "official" → stored as "official" | `source === "official"` |
| REPORT-008 | Source missing → defaults to "crowd" | `source === "crowd"` |
| REPORT-009 | Source "crowd" → stored as "crowd" | `source === "crowd"` |

### 3.6 Concurrency & Race Conditions

| ID | Test | Expected |
|----|------|----------|
| RACE-001 | Simultaneous reports to same checkpoint | All records created, no deadlocks |
| RACE-002 | High load (100 req/s) | Returns 429 after rate limit (100 req/min) |

---

## 4. Frontend PWA Test Plan

### 4.1 Unit (Vitest + @testing-library/react)

| Component | Tests |
|-----------|-------|
| **Home** | Renders loading state → shows "Loading..."; renders list of checkpoints; shows null wait time as "—" |
| **Search** | Input minimum 2 chars; submit calls API; results render; no API call on <2 chars |
| **Airport** | Loads data on mount; handles missing airport; renders checkpoints; wait time display |
| **App** | Routing works: `/`, `/search`, `/airport/:code`; InstallPrompt renders; dismiss works |
| **InstallPrompt** | Shows on `beforeinstallprompt`; install triggers prompt; dismiss hides it |

### 4.2 PWA / Service Worker

| ID | Test | Expected |
|----|------|----------|
| PWA-001 | Has valid manifest | `manifest.json` exists, has `name`, `short_name`, `icons`, `start_url` |
| PWA-002 | Service worker registers | `navigator.serviceWorker` is registered |
| PWA-003 | Offline shell loads | After first load, app shell is cached; works offline |
| PWA-004 | Install prompt works | `beforeinstallprompt` event triggers UI; Install button calls `.prompt()` |
| PWA-005 | Dismiss button hides prompt | Clicking dismiss removes the UI |

### 4.3 Mobile / Responsive

| ID | Test | Expected |
|----|------|----------|
| RESP-001 | Layouts on 320px–1440px | No horizontal scroll, readable text, touch targets >= 44px |
| RESP-002 | Touch-friendly inputs | Search input and buttons are easy to tap |
| RESP-003 | Font scales correctly | 16px base, readable on small screens |

---

## 5. Wait-Time Accuracy Test Plan

### 5.1 Consensus Model (if implemented)

| ID | Test | Expected |
|----|------|----------|
| CONSENSUS-001 | Single report → same value | Accuracy = 100% for that report |
| CONSENSUS-002 | Two similar reports (±5 min) → average close to actual | 80% within 5 min |
| CONSENSUS-003 | Outlier reports (±30 min) → filtered out | Model ignores or down-weights outliers |
| CONSENSUS-004 | Historical pattern fill-in | When no live report, pattern-based estimate displayed with source="pattern" |

### 5.2 Data Quality

| ID | Test | Expected |
|----|------|----------|
| QUALITY-001 | Stale data (8h old) → not shown or flagged | UI shows "No recent data" or warns |
| QUALITY-002 | Only official data → source tag shown | Clear "official" or "crowd" indicator |
| QUALITY-003 | Zero recent reports → pattern used | Falls back to historical average |

---

## 6. Integration Test Plan

### 6.1 API → DB

| ID | Test | Expected |
|----|------|----------|
| INT-001 | Search → raw SQL → Prisma → results | Returns correct airports with no N+1 queries |
| INT-002 | Report wait time → DB write → API read | Reported value immediately retrievable |
| INT-003 | Redis cache invalidation | After report, cache is cleared/stale data not served |

### 6.2 Frontend → API

| ID | Test | Expected |
|----|------|----------|
| INT-004 | Home fetches checkpoints on load | `/api/checkpoints` called, data rendered |
| INT-005 | Search → `/api/airports/search?q=` | Results match API response |
| INT-006 | Airport page → `/api/airports/:code` | Data loads and renders correctly |
| INT-007 | Network error → graceful fallback | UI shows "Unable to load — retry" |

### 6.3 Full Stack

| ID | Test | Expected |
|----|------|----------|
| E2E-001 | Home → Search → Airport → Report flow | End-to-end user journey works |
| E2E-002 | Report wait time, verify on Home | New value appears in checkpoint list |
| E2E-003 | Offline mode: cached pages work | Pages load without network |

---

## 7. Performance Test Plan

| ID | Test | Expected |
|----|------|----------|
| PERF-001 | API p95 latency < 200ms | Using `wrk` or similar on `/api/checkpoints` |
| PERF-002 | Home page load < 2s on 3G | Lighthouse "Performance" > 80 |
| PERF-003 | PWA offline shell < 1s after install | App shell is pre-cached |
| PERF-004 | Rate limiter effectiveness | 101st req in 60s returns 429 |

---

## 8. Security Test Plan

| ID | Test | Expected |
|----|------|----------|
| SEC-001 | SQL injection via search query → safe | Prisma parameterized queries, no injection |
| SEC-002 | XSS in airport name / checkpoint name → safe | Data is HTML-escaped in frontend |
| SEC-003 | Rate limiting prevents abuse | 429 returned after 100 req/min |
| SEC-004 | CORS headers correct | Only allowed origins can call API |

---

## 9. Regression Testing Before Release

### Pre-Release Checklist (run every time before shipping)

#### Backend
- [ ] All unit tests pass (`npm run test` in `packages/api`)
- [ ] All integration tests pass (against test DB)
- [ ] `/health` returns 200
- [ ] `/api/airports/search` returns results for "JFK"
- [ ] `/api/airports/search` with `q=a` returns 400
- [ ] `/api/airports/JFK` returns airport with checkpoints
- [ ] `/api/airports/XXX` returns 404
- [ ] `/api/checkpoints` returns list (check data, sort, cap)
- [ ] `POST /api/checkpoints/:id/wait-times` with valid body returns 201
- [ ] `POST` with negative minutes returns 400
- [ ] Rate limiting works (101st request → 429)

#### Frontend
- [ ] `npm run test` in `packages/web` passes
- [ ] Home renders and loads checkpoints
- [ ] Search works (2+ chars required)
- [ ] Airport page loads with correct data
- [ ] PWA install prompt works (Chrome DevTools)
- [ ] Service worker registers (DevTools > Application > Service Workers)
- [ ] Offline mode works (DevTools > Network > Offline)
- [ ] Layout is responsive on mobile (DevTools device toolbar)

#### Full Stack
- [ ] `npm run dev` starts both API and web without errors
- [ ] End-to-end: Home → Search for "JFK" → click JFK → view checkpoints → report wait time → verify on Home
- [ ] Lighthouse audit > 80 on Performance, > 90 on Accessibility
- [ ] No console errors during manual testing

---

## 10. Environment & CI Setup

### Test Databases
1. **Local dev**: `DATABASE_URL` pointing to `flyby_dev` (shared, seeded)
2. **Test / CI**: `DATABASE_URL` pointing to `flyby_test` (fresh per run, seeded via `prisma migrate reset`)
3. **Production**: `flyby_prod` (never touched by tests)

### Required Environment Variables (for CI/test)
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/flyby_test
REDIS_URL=redis://localhost:6379/1
VITE_API_URL=http://localhost:3000
```

### CI Pipeline
```yaml
steps:
  - unit-tests:
      api: npm run test --workspace=packages/api
      web: npm run test --workspace=packages/web
  - integration-tests:
      api: DATABASE_URL=test_db npm run test --workspace=packages/api -- --run
  - e2e-tests:
      - start dev server: npm run dev &
      - wait for healthy
      - run: npx playwright test
  - lighthouse-audit:
      - build web
      - serve build
      - run: npx lighthouse http://localhost:4173
```

---

## 11. Manual QA Checklist for MVP Launch

### Functional
- [ ] Airport search works on mobile (iOS Safari, Android Chrome)
- [ ] Wait time reporting flow is clear (no confusion on what to enter)
- [ ] Data accuracy: 80% of reports within 5 min of actual
- [ ] Checkpoints show correct latest wait time
- [ ] No data loss on app refresh or navigation

### PWA
- [ ] App installs on iOS (Add to Home Screen)
- [ ] App installs on Android (install prompt)
- [ ] Works offline after first load
- [ ] Offline indicator when network is unavailable

### UX / Accessibility
- [ ] All images have alt text
- [ ] Keyboard navigation works (tab through search, results, back)
- [ ] Screen reader friendly (landmarks, labels)
- [ ] Color contrast meets WCAG AA (checked via Lighthouse)

### Edge Cases
- [ ] No airports found → friendly "No results" message
- [ ] No checkpoints at airport → friendly message
- [ ] No wait time history → "—" or "No data"
- [ ] Very long wait times (>300 min) → validation prevents
- [ ] Simultaneous reports → no data corruption

---

## 12. Known Issues & Blockers

| ID | Issue | Impact | Next Step |
|----|-------|--------|-----------|
| BUG-001 | `GET /api/checkpoints` returns 500 when DB unreachable | Tests fail, app broken | Add proper connection handling + test with mocked Prisma |
| BUG-002 | `seed.test.ts` fails without `DATABASE_URL` | CI blocked | Document env vars + setup test DB in CI |
| BUG-003 | Web tests non-existent | No frontend coverage | Create test files for all components |
| BUG-004 | No E2E tests | Risk of regression | Integrate Playwright |

---

## 13. Metrics & Reporting

| Metric | Target | How Measured |
|--------|--------|-------------|
| Unit test coverage | ≥ 70% | Vitest `coverage` reporter |
| Integration test pass rate | 100% | CI pipeline |
| E2E critical paths | 100% pass | Playwright nightly run |
| Lighthouse Performance | ≥ 80 | `lighthouse` CI step |
| Lighthouse Accessibility | ≥ 90 | `lighthouse` CI step |
| PWA installability | Green | Chrome DevTools > Lighthouse |
| Manual QA pass | 100% checklist | Human QA engineer |

---

## 14. Recommendations

1. **Fix test environment setup**: Add `.env.example` to repo with required vars. Set up test database in CI.
2. **Mock Prisma in unit tests**: Use `vitest.mock('@prisma/client')` for unit tests to avoid DB dependency.
3. **Add integration tests with test DB**: Seed test DB, run integration tests, tear down per file.
4. **Add Playwright**: E2E tests for all critical user journeys (search → select → report).
5. **Add test coverage reporting**: `npx vitest run --coverage` in CI. Fail if < 70%.
6. **Mobile testing**: Run tests on real devices or simulators before MVP release.
7. **Wait-time accuracy**: Once the consensus model is built, add accuracy tests per section 5.

---

*Document version: 1.0*
*Last updated: 2026-05-20*
*Author: QA Engineer*
