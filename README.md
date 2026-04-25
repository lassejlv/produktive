# Produktive

Bun + Hono API for Produktive.

## Setup

```sh
bun install
cp .env.example .env
```

Fill in `.env`, then generate Prisma Client:

```sh
bun run db:generate
```

## Development

```sh
bun run dev
```

The API listens on `http://localhost:3000` by default.

## Docker

```sh
docker build -t produktive-api .
docker run --rm -p 3000:3000 --env-file .env produktive-api
```

## Database

Create and apply local migrations:

```sh
bun run db:migrate:dev --name init
```

Apply committed migrations in production:

```sh
bun run db:migrate:deploy
```
