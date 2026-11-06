# teamcollab — production image (Railway, Fly.io, or any Docker host).
# Needs at runtime: DATABASE_URL (Postgres), AUTH_SECRET, RESEND_API_KEY,
# EMAIL_FROM, and a persistent volume mounted at /data for uploaded files.

FROM node:22-bookworm-slim AS base
# Prisma's query engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
# The postinstall script runs `prisma generate`, which needs the schema.
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DIR=/data/storage
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/.next ./.next
EXPOSE 3000
# Apply pending migrations, then serve. A host-provided PORT wins over 3000.
# DATABASE_URL_UNPOOLED (used for migrations) defaults to DATABASE_URL.
CMD ["sh", "-c", "export DATABASE_URL_UNPOOLED=\"${DATABASE_URL_UNPOOLED:-$DATABASE_URL}\" && node_modules/.bin/prisma migrate deploy && exec node_modules/.bin/next start -H 0.0.0.0 -p \"${PORT:-3000}\""]
