# syntax=docker/dockerfile:1.7
#
# apps/app — Next.js panel + sakin portalı (MIMARI-PLAN §11).
#
# DİKKAT: bu imaja `DATABASE_URL` **verilmiyor** ve verilmemeli. Kural belgede
# değil altyapıda: birisi yanlışlıkla web katmanına SQL yazarsa üretimde ayağa
# kalkmaz. `ENCRYPTION_KEY` de yok — TCKN/IBAN çözme yalnız `api` içinde.

FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY apps/web/package.json apps/web/
COPY packages packages
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY tsconfig.base.json env-loader.mjs env-loader.d.mts ./
COPY apps/app apps/app
RUN pnpm --filter @yonetim/app build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/app ./apps/app
COPY --from=build /repo/packages ./packages

USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@yonetim/app", "start"]
