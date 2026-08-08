FROM node:22.16.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable \
  && corepack prepare pnpm@11.20.0 --activate

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY .npmrc eslint.config.mjs drizzle.config.ts ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY services/model-gateway/package.json services/model-gateway/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/finance-math/package.json packages/finance-math/package.json
COPY packages/observability/package.json packages/observability/package.json

RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22.16.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable \
  && corepack prepare pnpm@11.20.0 --activate \
  && groupadd --system --gid 10001 cherryfin \
  && useradd --system --uid 10001 --gid cherryfin --home /workspace cherryfin

COPY --from=build --chown=cherryfin:cherryfin /workspace /workspace
USER cherryfin

CMD ["node", "apps/api/dist/server.js"]
