# ─── Brain Blitz — Game Server Dockerfile ──────────────────────────────────────
# Multi-stage build for the Express game server.
#
# The React client SPA is pre-built on the host (via azd prepackage hook)
# and included in the Docker context at client/dist/. This avoids running
# esbuild's Go binary inside Docker Desktop, which crashes with lfstack.push
# panics due to address-space limitations.
#
# The server serves the client SPA in production mode (see server/src/index.ts).
# Expects a volume mount at /app/server/uploads for image uploads.

# ── Stage 1: Install all workspace dependencies ──────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# Copy root workspace definition + all package.jsons for npm workspaces
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY mcp-server/package.json mcp-server/

# Install all workspace deps (including devDependencies for building)
RUN npm ci

# ── Stage 2: Build the server TypeScript ─────────────────────────────────────
FROM deps AS server-build
WORKDIR /app

COPY server/ server/
RUN npm run build --workspace=server

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY mcp-server/package.json mcp-server/

# Install production-only dependencies
RUN npm ci --omit=dev

# Copy compiled server code
COPY --from=server-build /app/server/dist/ server/dist/

# Copy pre-built client SPA (built on host, served by Express in production)
COPY client/dist/ client/dist/

# Create uploads directory (will be overridden by Azure Files mount)
RUN mkdir -p server/uploads

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

RUN apk add --no-cache wget

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server/dist/index.js"]
