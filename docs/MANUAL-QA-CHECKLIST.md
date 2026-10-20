# Flyby Manual QA Checklist

Run before every release. Check off each item.

## Backend (API)

- [ ] `GET /health` returns `200` with `{ ok: true }`
- [ ] `GET /api/airports/search?q=JFK` returns JFK as first result
- [ ] `GET /api/airports/search?q=a` returns `400` (min 2 chars)
- [ ] `GET /api/airports/search?q=nonexistent` returns `200` with empty `data`
- [ ] `GET /api/airports/JFK` returns airport with checkpoints containing latest wait times
- [ ] `GET /api/airports/XXX` returns `404`
- [ ] `GET /api/checkpoints` returns sorted list, capped at 100, with airport info
- [ ] `GET /api/checkpoints/:id` returns checkpoint with wait time history
- [ ] `GET /api/checkpoints/:id/history?hours=6` returns 15-min bucket sparkline data
- [ ] `POST /api/checkpoints/:id/wait-times` with valid body returns `201`
- [ ] `POST /api/checkpoints/:id/wait-times` with negative minutes returns `400`
- [ ] `POST /api/checkpoints/:id/wait-times` with minutes > 300 returns `400`
- [ ] Rate limiting: 2 rapid POST requests → second returns `429`
- [ ] `GET /api/dashboard` returns accuracy metrics + history + per-checkpoint breakdown
- [ ] `POST /v1/auth/signup` creates account and returns JWT token
- [ ] `POST /v1/auth/login` with valid credentials returns JWT token
- [ ] `POST /v1/auth/login` with bad password returns `401`
- [ ] `GET /v1/auth/me` with valid token returns user profile
- [ ] `GET /v1/auth/me` without token returns `401`
- [ ] `POST /v1/auth/link-session` links anonymous reports to user

## Frontend (PWA)

- [ ] Home page loads and displays checkpoints with wait times
- [ ] Wait times color-coded: green (0-15), yellow (15-30), orange (30-45), red (45+)
- [ ] Search: 2+ chars required, results render, empty state works
- [ ] Airport detail page loads with checkpoint list
- [ ] Checkpoint detail page shows history chart (recharts), stats grid, recent reports
- [ ] Dashboard (protected route) shows accuracy metrics with charts
- [ ] Report modal opens, slider works, submit succeeds
- [ ] Report modal shows rate limit countdown on rapid submits
- [ ] SSE updates appear in real-time without page reload
- [ ] Login form submits and redirects
- [ ] Signup form submits and redirects
- [ ] Profile page shows user info and report history
- [ ] Protected routes redirect to /login when unauthenticated
- [ ] 404 page shows for unknown routes

## PWA / Offline

- [ ] App installs via browser prompt (Chrome)
- [ ] Service worker registers (check DevTools > Application > Service Workers)
- [ ] After first load, app shell loads offline (DevTools > Network > Offline)
- [ ] Offline indicator bar appears when network is disconnected
- [ ] Wait time reports are queued offline, submitted when back online
- [ ] Pending report count shows on offline indicator

## Responsive / Mobile

- [ ] Layout works on 320px width (no horizontal scroll)
- [ ] Layout works on 768px width (tablet)
- [ ] Layout works on 1440px width (desktop)
- [ ] Touch targets >= 44px
- [ ] Font is readable at all breakpoints

## Performance

- [ ] Lighthouse Performance >= 80
- [ ] Lighthouse Accessibility >= 90
- [ ] Lighthouse Best Practices >= 90
- [ ] Lighthouse SEO >= 90
- [ ] No console errors during manual testing
- [ ] Cold load < 3s on simulated 3G

## Edge Cases

- [ ] No airports found for search query → friendly message
- [ ] No checkpoints at airport → friendly message
- [ ] No wait time history → "—" or "No data"
- [ ] Very long airport/city names → no layout breakage
- [ ] Browser back/forward navigation works correctly
- [ ] Page refresh preserves state (search query, auth token)
