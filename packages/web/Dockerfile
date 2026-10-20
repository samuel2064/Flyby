# syntax=docker/dockerfile:1.6
# Flyby Web PWA image
# Builds @flyby/web in isolation and serves static assets with nginx

# ---------------- build stage ----------------
FROM node:20-alpine AS builder

WORKDIR /app

# 1. Bring in the web package manifest first to maximize layer caching.
COPY packages/web/package.json packages/web/package-lock.json* ./packages/web/

# 2. Install the web package's own dependencies (isolated, not root workspaces).
WORKDIR /app/packages/web
RUN npm ci --include=dev

# 3. Copy the web source for the build.
WORKDIR /app
COPY packages/web ./packages/web

# 4. Build the production assets (outputs to packages/web/dist)
WORKDIR /app/packages/web
RUN npm run build

# ---------------- runtime stage ----------------
FROM nginx:alpine AS runtime

# Copy nginx config
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]