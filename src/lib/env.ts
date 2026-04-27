import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.url(),
    DATABASE_DIRECT_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .parse(process.env);
