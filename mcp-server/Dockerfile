# ─── Brain Blitz — MCP Server Dockerfile ──────────────────────────────────────
# Multi-stage build for the Model Context Protocol server.
#
# Widget HTML files are pre-built on the host (via azd prepackage hook)
# and included in the Docker context at mcp-server/src/widgets/*.html.
# This avoids running esbuild's Go binary inside Docker Desktop,
# which crashes with lfstack.push panics.
#
# In production, GAME_SERVER_PROXY_TARGET env var points to the game server
# Container App FQDN (set by Bicep).

# ── Stage 1: Install all workspace dependencies ──────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# Copy root workspace definition + all package.jsons
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY mcp-server/package.json mcp-server/

# Install all workspace deps
RUN npm ci

# ── Stage 2: Build the MCP server TypeScript ─────────────────────────────────
FROM deps AS mcp-build
WORKDIR /app

COPY mcp-server/src/ mcp-server/src/
COPY mcp-server/tsconfig.json mcp-server/

RUN npm run build --workspace=mcp-server

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY mcp-server/package.json mcp-server/

# Install production-only dependencies
RUN npm ci --omit=dev

# Copy compiled MCP server
COPY --from=mcp-build /app/mcp-server/dist/ mcp-server/dist/

# Copy pre-built widget HTML files into dist/widgets/ (where runtime expects them)
COPY mcp-server/src/widgets/ mcp-server/dist/widgets/

ENV NODE_ENV=production
ENV MCP_PORT=3002
EXPOSE 3002

RUN apk add --no-cache wget

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["node", "mcp-server/dist/index.js"]
