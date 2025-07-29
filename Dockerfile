# Multi-stage Dockerfile for Cardano OTC Trading System
# Optimized for production deployment with security and performance

# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    linux-headers

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with npm ci for reproducible builds
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S otcapp -u 1001 -G nodejs

# Install production dependencies only
RUN apk add --no-cache \
    dumb-init \
    curl

# Set working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

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
CMD ["node", "server/index.js"]