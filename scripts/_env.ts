import { config as loadEnv } from "dotenv";

/**
 * Env for scripts run outside Next.
 *
 * Import this **first**, before anything that reaches `lib/db/prisma.ts` — that
 * module builds its client at import time and throws without `DATABASE_URL`.
 * Same file order Next itself uses (`.env`, then `.env.local` wins), and the
 * same order `prisma.config.ts` loads them in.
 */
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
