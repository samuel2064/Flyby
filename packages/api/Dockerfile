# syntax=docker/dockerfile:1.6
# Flyby API image
# Builds @flyby/api in isolation (no npm workspaces required at build time)
# so missing sibling workspace manifests (packages/web, packages/e2e) do not
# break `npm ci`. See TIR-217.

# ---------------- build stage ----------------
FROM node:20-alpine AS builder

WORKDIR /app

# 1. Bring in the api package manifest first to maximize layer caching.
COPY packages/api/package.json packages/api/package-lock.json* ./packages/api/

# 2. Install the api package's own dependencies (isolated, not root workspaces).
#    `npm ci --include=dev` pulls devDeps (prisma, tsx, @prisma/client) needed
#    for `prisma generate` and `tsc`.
WORKDIR /app/packages/api
RUN npm ci --include=dev

# 3. Copy the api source (and prisma schema dir) for the build.
WORKDIR /app
COPY packages/api ./packages/api

# 4. Generate the Prisma client from packages/api/prisma/schema.prisma
WORKDIR /app/packages/api
RUN npx prisma generate

# 5. Compile TypeScript -> dist/
RUN npm run build

# ---------------- runtime stage ----------------
FROM node:20-alpine AS runtime

WORKDIR /app

# dumb-init for PID 1 signal handling
RUN apk add --no-cache dumb-init

# Copy the api manifest, then install ONLY production deps.
COPY packages/api/package.json packages/api/package-lock.json* ./packages/api/
WORKDIR /app/packages/api
RUN npm ci --omit=dev && npm cache clean --force

# Bring over the compiled output, the Prisma client bundle, and the schema.
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/node_modules/.prisma ./packages/api/node_modules/.prisma
COPY --from=builder /app/packages/api/node_modules/@prisma ./packages/api/node_modules/@prisma
COPY --from=builder /app/packages/api/prisma ./packages/api/prisma

# Runtime env (overridable by docker-compose)
ENV NODE_ENV=production \
    PORT=3001

EXPOSE 3001

# Matches the /api/health route added in packages/api/src/app.ts and the
# healthcheck declared in docker-compose.yml.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/api/dist/server.js"]
