# ---- Stage 1: Install dependencies ----
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Copy workspace manifests for dependency resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/hub/package.json packages/hub/package.json
# Plugin + tools stubs needed so pnpm workspace resolves correctly
COPY packages/plugin/package.json packages/plugin/package.json
COPY packages/web/package.json packages/web/package.json
COPY tools/asset-gen/package.json tools/asset-gen/package.json

RUN pnpm install --frozen-lockfile

# ---- Stage 2: Build ----
FROM deps AS build

# Copy tsconfig files
COPY tsconfig.base.json ./
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/hub/tsconfig.json packages/hub/tsconfig.json

# Copy source
COPY packages/shared/src packages/shared/src
COPY packages/hub/src packages/hub/src

# Build shared first (hub depends on it), then hub
RUN pnpm --filter @agentverse/shared build && pnpm --filter @agentverse/hub build

# ---- Stage 3: Production runtime ----
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Copy workspace manifests + install production only
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/hub/package.json packages/hub/package.json
COPY packages/plugin/package.json packages/plugin/package.json
COPY packages/web/package.json packages/web/package.json
COPY tools/asset-gen/package.json tools/asset-gen/package.json

RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/hub/dist packages/hub/dist

# Copy drizzle migrations (needed at runtime for programmatic migrate)
COPY packages/hub/drizzle packages/hub/drizzle

# Copy static assets served by @fastify/static
COPY packages/hub/public packages/hub/public

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /app/packages/hub
CMD ["node", "dist/main.js"]
