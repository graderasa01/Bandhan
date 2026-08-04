import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7: Migrate/Studio read the connection string from here, not from
// the schema file. The runtime `PrismaClient` uses its own adapter — see
// lib/db/prisma.ts — so the URL is configured in exactly two places, both
// reading the same `DATABASE_URL` env var. Loaded in the same order Next.js
// uses (.env then .env.local, later wins) since this file runs outside Next.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  experimental: {
    extensions: true, // required for the `extensions = [vector]` datasource block
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
