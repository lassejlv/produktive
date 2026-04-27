import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.url(),
    DATABASE_DIRECT_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(3000),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().min(1).default("Produktive <be@produktive.app>"),
  })
  .parse(process.env);
