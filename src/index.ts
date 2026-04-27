import { auth } from "./lib/auth";
import { env } from "./lib/env";
import { Hono } from "hono";

export const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Mom!");
});

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`API listening on ${server.url}`);
