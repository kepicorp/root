# Multi-stage build: compile the React bundle once, then ship a slim Node
# image that serves the bundle + the WebSocket server on a single port.
#
# We do all the npm work in the builder stage and copy the pruned
# node_modules into the runtime image. BuildKit otherwise parallelizes
# the two stages and ends up running two `npm ci` invocations at once,
# which is enough to OOM-kill the install on small VMs.

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_ENV=development

# Install all deps (build needs dev deps for tsc / vite). --include=dev
# defends against hosts that export NODE_ENV=production. Bump fetch
# timeout / retries so a slow registry doesn't kill the install. We split
# install + verify into separate RUNs so a future failure points at the
# specific step (npm itself vs. missing devDep) instead of an ambiguous
# chained shell exit.
COPY package*.json ./
RUN npm ci --include=dev --no-audit --no-fund \
      --fetch-timeout=300000 --fetch-retries=5 --loglevel=warn
RUN test -x node_modules/.bin/tsc  || (echo "ERROR: tsc not installed — devDependencies skipped?"  && ls node_modules/.bin/ && exit 1)
RUN test -x node_modules/.bin/vite || (echo "ERROR: vite not installed — devDependencies skipped?" && ls node_modules/.bin/ && exit 1)

# Copy source and build the production bundle.
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
RUN npm run build

# Prune dev deps in place and add tsx (used at runtime to run the TS server).
RUN npm prune --omit=dev \
 && npm install --no-save --no-audit --no-fund tsx \
      --fetch-timeout=300000 --fetch-retries=5

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV DIST_DIR=/app/dist

# No fresh npm install here — pull the already-pruned tree from the builder.
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/healthz || exit 1

CMD ["npx", "tsx", "server/index.ts"]
