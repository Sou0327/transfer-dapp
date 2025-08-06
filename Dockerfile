# Multi-stage Dockerfile for Cardano OTC Trading System
# Optimized for production deployment with security and performance

# Build stage
FROM node:20-alpine AS builder

# Install build dependencies and yarn
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    linux-headers

# Enable corepack for yarn support
RUN corepack enable

# Set working directory
WORKDIR /app

# Copy package files (yarn.lock is critical for reproducible builds)
COPY package.json yarn.lock ./

# Install dependencies with yarn for reproducible builds
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Production stage
FROM node:20-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S otcapp -u 1001 -G nodejs

# Install production dependencies and enable yarn
RUN apk add --no-cache \
    dumb-init \
    curl && \
    corepack enable

# Set working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Copy built application from builder stage
COPY --from=builder --chown=otcapp:nodejs /app/dist ./dist
COPY --from=builder --chown=otcapp:nodejs /app/server ./server
COPY --from=builder --chown=otcapp:nodejs /app/database ./database

# Copy other necessary files
COPY --chown=otcapp:nodejs index.html ./
COPY --chown=otcapp:nodejs vite.config.ts ./

# Create logs directory
RUN mkdir -p /app/logs && chown otcapp:nodejs /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 4000

# Switch to non-root user
USER otcapp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server/app.cjs"]