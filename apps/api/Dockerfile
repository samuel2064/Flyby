# ---- Base Node.js image ----
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Set ownership for application code
RUN chown -R nextjs:nodejs /app

# ---- Dependencies stage (all deps for development) ----
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for development)
RUN npm ci

# ---- Production dependencies stage (prod only) ----
FROM base AS prod-deps

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# ---- Development stage ----
FROM deps AS development

# Copy source code
COPY . .

# Set ownership for application code
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Start the application in development mode
CMD ["npm", "run", "dev"]

# ---- Production stage ----
FROM prod-deps AS production

# Copy source code
COPY . .

# Set ownership for application code
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Start the application in production mode
CMD ["npm", "start"]