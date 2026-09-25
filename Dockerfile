ARG APP
ARG BUN_VERSION=1.3.13

FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app

FROM base AS pruner
ARG APP

ENV TURBO_TELEMETRY_DISABLED=1 \
    CI=true

COPY package.json bun.lock turbo.json .npmrc ./
COPY apps ./apps
COPY packages ./packages

RUN bun --bun x turbo@2.9.12 prune --docker "${APP}" --out-dir=out

WORKDIR /app/out/json

RUN bun install && rm -rf node_modules

FROM base AS builder
ARG APP
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:5000} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL:-ws://localhost:8080} \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
    
COPY --from=pruner /app/out/json/ ./
RUN bun install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./

ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN if [ -d packages/database ]; then \
        cd packages/database && bunx prisma generate; \
    fi
RUN bun --bun node_modules/turbo/bin/turbo run build --filter="${APP}"
RUN mkdir -p /app/apps/web/.next /app/packages/database/generated

FROM base AS runner
ARG APP
ENV APP=${APP} \
    NODE_ENV=production \
    PORT=3000

COPY --from=pruner /app/out/json/ ./
RUN bun install --frozen-lockfile --production
COPY --from=pruner /app/out/full/ ./
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/packages/database/generated ./packages/database/generated

RUN chown -R bun:bun /app
COPY --chown=bun:bun docker-entrypoint.sh /usr/local/bin/exchange-entrypoint

RUN chmod +x /usr/local/bin/exchange-entrypoint

USER bun

ENTRYPOINT ["/usr/local/bin/exchange-entrypoint"]
