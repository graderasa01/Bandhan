# Debian-based (not Alpine): Prisma's engines and `sharp`'s prebuilt binaries
# both target glibc first and have historically had musl edge cases. Given
# this image needs to be right on the first production deploy, glibc removes
# a whole category of "works locally, breaks in the container" risk for a
# small increase in image size.
FROM node:20-bookworm-slim AS base
# Without this, `prisma generate` can't detect libssl and silently guesses
# "openssl-1.1.x" (measured on this exact base image) — a guess that only
# fails once something actually needs the engine binary at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ---- deps: install with dev dependencies, once, cached by lockfile ----
# `npm ci`'s postinstall runs `prisma generate`, which reads the schema —
# hence copying prisma/ before installing rather than after.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- builder: compile Next.js in standalone mode ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are baked into the client bundle at build time, not
# read at container startup — this must be the real production origin, not
# whatever the shell that runs `docker build` happens to have set.
ARG NEXT_PUBLIC_APP_URL=https://bandhantak.com
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
# `next build` statically analyzes every API route (to decide what it can
# prerender), which imports lib/db/prisma.ts, which throws immediately if
# DATABASE_URL is unset — measured: the build fails at "Collecting page
# data" for /api/admin/growth without this, before a single query would ever
# run. `pg.Pool` doesn't connect until a query executes, so this only needs to
# be a well-formed connection string, never a reachable database — confirmed
# by building against this exact placeholder.
#
# Fixed and fake on purpose, not something the deploy workflow overrides:
# threading the *real* DATABASE_URL through `--build-arg` would bake it into
# the image's layer history (`docker history` shows every ARG) for zero
# benefit, since nothing at build time ever queries it. The real value is
# only ever given to the container at runtime, by App Runner.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build_placeholder
ENV DATABASE_URL=$DATABASE_URL
RUN npm run build

# ---- runner: only the standalone trace output, nothing else ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# `output: "standalone"` (next.config.ts) traces the exact node_modules
# subset this app imports into `.next/standalone` and writes its own
# `server.js` there — this is the whole runtime, not next/next-start.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Deliberately does NOT run `prisma migrate deploy` — unlike Railway's start
# script, an App Runner service can run several instances that boot at once
# (deploys, autoscaling), and migrations belong to a single, explicit CI step
# against the database, not to every instance's cold start. See the deploy
# workflow's "migrate" job.
CMD ["node", "server.js"]
