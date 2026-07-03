# Production image for the deshahed web app.
#
# Uses Next's `output: "standalone"` (next.config.mjs) so the runtime stage
# ships only the traced server + a minimal node_modules — small image, fast
# cold starts, and real ISR cache headers (s-maxage) instead of the `no-store`
# that `next dev` emits. Local hot-reload development still uses Dockerfile.dev.

# ---- deps -----------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm install

# ---- build ----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# API is unreachable during build; serverStatus fetches fail-soft to "safe"
# and ISR refreshes real state at runtime (revalidate=600).
RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apk add --no-cache libc6-compat \
  && addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001

# Standalone server + its traced node_modules, then the static assets and
# public files it serves.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
