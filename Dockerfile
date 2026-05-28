# Woolly Chain - Sovereign Proof-of-Nourishment Blockchain
# Multi-stage build for minimal production image

# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# --- Production stage ---
FROM node:20-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -S woolly && adduser -S woolly -G woolly

# Copy production dependencies
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# Copy compiled JS
COPY --from=builder /app/dist ./dist

# Create data directory
RUN mkdir -p /app/data && chown -R woolly:woolly /app/data

# Switch to non-root
USER woolly

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Environment
ENV NODE_ENV=production
ENV WOOLLY_PORT=3000
ENV WOOLLY_DATA_DIR=/app/data

# Start node
CMD ["node", "dist/node/index.js", "--port", "3000", "--data-dir", "/app/data"]
