import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.url(),
    DATABASE_DIRECT_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(3000),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().min(1).default("Produktive <be@produktive.app>"),
    CORS_ORIGINS: z
      .string()
      .default(
        "https://produktive.app,https://*.produktive.app,http://localhost:5173,http://127.0.0.1:5173",
      )
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    AUTH_COOKIE_DOMAIN: z.string().trim().default("produktive.app"),
  })
  .parse(process.env);
