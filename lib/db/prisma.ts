import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires a driver adapter for a direct DB connection — the schema
// file no longer carries `url`, see prisma.config.ts for the Migrate/Studio
// side of the same DATABASE_URL.
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set — see .env.example.");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Standard Next.js dev-mode singleton — without this, every hot-reload
// opens a fresh connection pool against Postgres until it's exhausted.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
