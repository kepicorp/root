# Multi-stage build: compile the React bundle once, then ship a slim Node
# image that serves the bundle + the WebSocket server on a single port.

# ── Build stage ──────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Install all deps (build needs tsc + vite from devDependencies).
COPY package*.json ./
RUN npm ci --include=dev

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV DIST_DIR=/app/dist

COPY package*.json ./
# Install production deps natively for the target platform (not copied from builder).
RUN npm ci --omit=dev && npm install --no-save tsx
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/healthz || exit 1

CMD ["npx", "tsx", "server/index.ts"]
