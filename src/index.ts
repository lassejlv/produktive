import { auth } from "./lib/auth";
import { Hono } from "hono";

export const app = new Hono();

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

const port = Number(Bun.env.PORT ?? 3000);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`API listening on http://localhost:${port}`);
