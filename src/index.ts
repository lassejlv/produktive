import { auth } from "./lib/auth";
import { env } from "./lib/env";
import { issueRoutes } from "./routes/issue";
import { Hono } from "hono";
import { cors } from "hono/cors";

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) => (env.CORS_ORIGINS.includes(origin) ? origin : env.CORS_ORIGINS[0]),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/", (c) => {
  return c.text("Hello Mom!");
});

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.route("/api/issues", issueRoutes);

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`API listening on ${server.url}`);
