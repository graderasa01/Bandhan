-- CreateEnum
CREATE TYPE "GrioMemoryKind" AS ENUM ('FACT', 'PREFERENCE', 'BOUNDARY', 'GOAL', 'RELATIONSHIP_NOTE', 'TEMPORARY_CONTEXT');

-- CreateTable
CREATE TABLE "grio_memory_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "GrioMemoryKind" NOT NULL DEFAULT 'FACT',
    "source" "SignalSource" NOT NULL DEFAULT 'USER_ENTERED',
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "confidence" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grio_memory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grio_memory_entries_supersedesId_key" ON "grio_memory_entries"("supersedesId");

-- CreateIndex
CREATE INDEX "grio_memory_entries_userId_replacedAt_idx" ON "grio_memory_entries"("userId", "replacedAt");

-- AddForeignKey
ALTER TABLE "grio_memory_entries" ADD CONSTRAINT "grio_memory_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grio_memory_entries" ADD CONSTRAINT "grio_memory_entries_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "grio_memory_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Carry every existing memory across.
--
-- `grio_memories.facts` is a JSON array of strings and was the only store until
-- now. Backfilling here rather than in application code is deliberate: the app
-- stops writing that column in the same release, so a lazy "migrate on next
-- read" would leave anybody who does not open Grio again with their memory
-- silently gone from the model's view while still sitting in the database.
--
-- Everything lands as FACT/USER_ENTERED/confirmed, which is exactly what those
-- rows were: things a user typed or tapped Remember on. Guessing a richer kind
-- from the text would be inventing provenance the old column never carried.
-- `createdAt` is inherited so ordering survives the move.
INSERT INTO "grio_memory_entries" ("id", "userId", "body", "kind", "source", "confirmed", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  m."userId",
  fact.value #>> '{}',
  'FACT'::"GrioMemoryKind",
  'USER_ENTERED'::"SignalSource",
  true,
  m."createdAt",
  m."updatedAt"
FROM "grio_memories" m
CROSS JOIN LATERAL jsonb_array_elements(m."facts"::jsonb) AS fact(value)
WHERE jsonb_typeof(m."facts"::jsonb) = 'array'
  AND fact.value #>> '{}' IS NOT NULL
  AND length(trim(fact.value #>> '{}')) > 0;
