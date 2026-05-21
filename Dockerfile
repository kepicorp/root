# Multi-stage build: compile the React bundle once, then ship a slim Node
# image that serves the bundle + the WebSocket server on a single port.

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install all deps (build needs dev deps for tsc / vite). Force dev deps in
# case the host environment exports NODE_ENV=production or has
# NPM_CONFIG_PRODUCTION baked in — either would otherwise make `npm ci`
# silently skip devDependencies and leave tsc / vite out of node_modules.
ENV NODE_ENV=development
ENV NPM_CONFIG_PRODUCTION=false
COPY package*.json ./
RUN npm ci --include=dev --no-audit --no-fund \
 && test -x node_modules/.bin/tsc \
 && test -x node_modules/.bin/vite

# Copy source.
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server

# Vite production build → ./dist
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV DIST_DIR=/app/dist

# Install only the runtime deps we need (server uses ws + immer + tsx).
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm install --no-save tsx

# Pull in just what the server needs at runtime.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/healthz || exit 1

CMD ["npx", "tsx", "server/index.ts"]
