FROM oven/bun:latest AS base
WORKDIR /app
ARG DATABASE_URL
ARG DATABASE_DIRECT_URL
ARG PORT
ARG RESEND_API_KEY
ARG RESEND_FROM_EMAIL
ARG CORS_ORIGINS
ARG AUTH_COOKIE_DOMAIN

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM install AS build
COPY src src
COPY tsconfig.json tsconfig.json
COPY prisma prisma
COPY prisma.config.ts prisma.config.ts
RUN bun run db:generate
RUN bun run db:migrate:deploy
RUN bun run check
RUN bun run build

FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/prisma prisma
COPY --from=build /app/prisma.config.ts prisma.config.ts
EXPOSE 3000
CMD ["bun", "run", "start"]
