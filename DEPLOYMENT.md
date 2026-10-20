# Deployment Checklist

## Pre-Deployment Verification

### Code Quality
- [x] All tests passing (327/327 - 100%)
- [x] No TypeScript errors (build passes cleanly)
- [x] CI/CD pipeline configured (`.github/workflows/ci.yml`)
- [x] Code reviewed and documented

### Backend Ready
- [x] API endpoints implemented (AIRdocs/API.md)
- [x] Database schema finalized (`packages/api/prisma/schema.prisma`)
- [x] Prisma client generated
- [x] Seed data available (51 airports, 159 checkpoints)
- [x] Redis SSE pub/sub configured
- [x] Rate limiting enabled (30s per session)
- [x] Input validation on all endpoints (reportedAt, minutes, checkpointId, airport search)
- [x] Environment variables documented

### Frontend Ready
- [x] PWA configured (manifest, service worker)
- [x] Real-time SSE integration working
- [x] Offline queue functional (IndexedDB)
- [x] Responsive design (mobile-first)
- [x] Error handling implemented

### Infrastructure
- [ ] Production database (PostgreSQL) connection string configured
- [ ] Redis production instance configured
- [ ] Environment variables set:
  - `DATABASE_URL` (PostgreSQL)
  - `REDIS_URL`
  - `NODE_ENV=production`
  - `ADMIN_API_KEY` (required for `DELETE /api/reports/:id` — generate with `openssl rand -hex 32`; if unset, report deletion is disabled and returns 503)
- [ ] Domain/DNS configured
- [ ] SSL certificates ready

### Monitoring & Logging
- [ ] Error tracking (Sentry/Rollbar) configured
- [ ] Application logging enabled
- [ ] Performance monitoring setup
- [ ] Uptime monitoring configured

### Security
- [x] Rate limiting enabled
- [x] CORS configured
- [x] Input validation on all endpoints (reportedAt required, minutes 0-300, checkpointId validated, airport search validated)
- [ ] HTTPS enforced (infra/deployment)
- [x] Security headers configured (helmet + custom middleware, all 6 headers tested)

## Deployment Steps

### 1. Database Setup
```bash
# Install dependencies
npm ci

# Generate Prisma client
npm run db:generate

# Run migrations on production database
cd packages/api
npx prisma migrate deploy

# Seed initial data
npx ts-node prisma/seed.ts
```

### 2. Build Application
```bash
# From project root
npm run build
```

### 3. Start Services
```bash
# Backend (port 3001)
cd packages/api
npm start

# Frontend (served via nginx/Vercel/Netlify)
cd packages/web
npm run build
# Deploy dist/ to static hosting
```

### 4. Verify Deployment
- [ ] Health check: `GET /health` returns `{"ok": true}`
- [ ] Airport search: `GET /api/airports?q=JFK` returns results
- [ ] Checkpoints: `GET /api/checkpoints` returns list
- [ ] SSE stream: `GET /api/checkpoints/stream` connects successfully
- [ ] Report submission: `POST /api/checkpoints/:id/wait-times` works
- [ ] Admin delete auth: `DELETE /api/reports/<any-id>` returns 401 without `X-Admin-Key` and 404 with a valid key (validates `ADMIN_API_KEY` is configured)
- [ ] Offline mode: Reports queue when offline

## Rollback Plan

If deployment fails:
1. Revert to previous git commit
2. Redeploy with `npm run build`
3. Restore database from backup if needed
4. Notify users via status page

## Post-Deployment

### Immediate (Day 1)
- [ ] Monitor error logs
- [ ] Check SSE connection success rate
- [ ] Verify database performance
- [ ] Test offline queue sync

### Week 1
- [ ] Review user feedback
- [ ] Monitor performance metrics
- [ ] Track daily active users
- [ ] Identify bugs or edge cases

### Ongoing
- [ ] Weekly dependency updates
- [ ] Monthly security audit
- [ ] Feature iteration based on feedback

## Success Metrics

- **Availability:** >99.9% uptime
- **Performance:** <200ms API response time (p95)
- **Accuracy:** Wait time estimates within 5 minutes (80% of reports)
- **Adoption:** 100+ daily active users in first month

## Contact

- **Engineering:** Founding Engineer
- **CEO:** Reports to CEO
- **Status Page:** [To be configured]