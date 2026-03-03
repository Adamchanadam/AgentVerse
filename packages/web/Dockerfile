# ---- Stage 1: Install dependencies ----
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Copy workspace manifests for dependency resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/web/package.json packages/web/package.json
# Stubs needed so pnpm workspace resolves correctly
COPY packages/hub/package.json packages/hub/package.json
COPY packages/plugin/package.json packages/plugin/package.json
COPY tools/asset-gen/package.json tools/asset-gen/package.json

RUN pnpm install --frozen-lockfile

# ---- Stage 2: Build ----
FROM deps AS build

# Copy tsconfig files
COPY tsconfig.base.json ./
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json

# Copy source — shared must be built first (web imports from it)
COPY packages/shared/src packages/shared/src
RUN pnpm --filter @agentverse/shared build

# Copy web source + config
COPY packages/web/src packages/web/src
COPY packages/web/public packages/web/public
COPY packages/web/next.config.ts packages/web/next.config.ts
COPY packages/web/tsconfig.json packages/web/tsconfig.json

# HUB_URL must be set at build time (Next.js bakes rewrites into the build)
ARG HUB_URL=http://hub:3000
ENV HUB_URL=${HUB_URL}

# Build Next.js (standalone output)
RUN pnpm --filter @agentverse/web build

# ---- Stage 3: Production runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

# Copy Next.js standalone output (includes node_modules + server.js)
COPY --from=build /app/packages/web/.next/standalone ./
# Copy static assets and public files (not included in standalone)
COPY --from=build /app/packages/web/.next/static packages/web/.next/static
COPY --from=build /app/packages/web/public packages/web/public

ENV NODE_ENV=production
EXPOSE 3001

WORKDIR /app/packages/web
CMD ["node", "server.js"]
