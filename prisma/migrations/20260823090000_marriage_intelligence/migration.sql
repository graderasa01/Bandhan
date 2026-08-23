-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('USER_ENTERED', 'USER_CONFIRMED_AI', 'BIODATA_EXTRACTED', 'AI_INFERRED', 'GOOGLE_IMPORTED', 'VERIFIED_DOCUMENT');

-- CreateEnum
CREATE TYPE "RespondentType" AS ENUM ('SELF', 'PARENT', 'GUARDIAN', 'FAMILY_MEMBER');

-- CreateEnum
CREATE TYPE "SignalVisibility" AS ENUM ('PROFILE_VISIBLE', 'MATCH_PRIVATE', 'PRIVATE');

-- AlterTable
-- Defaulted, so every existing row keeps working untouched: a profile that was
-- filled before this migration is treated as self-answered, which is what it
-- always implicitly was.
ALTER TABLE "profiles" ADD COLUMN "respondentType" "RespondentType" NOT NULL DEFAULT 'SELF';

-- CreateTable
CREATE TABLE "profile_signal_answers" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "answerJson" JSONB NOT NULL,
    "source" "SignalSource" NOT NULL DEFAULT 'USER_ENTERED',
    "respondentType" "RespondentType" NOT NULL DEFAULT 'SELF',
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "visibility" "SignalVisibility" NOT NULL DEFAULT 'MATCH_PRIVATE',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_signal_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_field_provenance" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "source" "SignalSource" NOT NULL,
    "confidence" INTEGER,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "sourceContext" TEXT,
    "respondentType" "RespondentType" NOT NULL DEFAULT 'SELF',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_field_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_signal_answers_profileId_idx" ON "profile_signal_answers"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_signal_answers_profileId_key_key" ON "profile_signal_answers"("profileId", "key");

-- CreateIndex
CREATE INDEX "profile_field_provenance_profileId_idx" ON "profile_field_provenance"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_field_provenance_profileId_fieldKey_key" ON "profile_field_provenance"("profileId", "fieldKey");

-- AddForeignKey
ALTER TABLE "profile_signal_answers" ADD CONSTRAINT "profile_signal_answers_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_field_provenance" ADD CONSTRAINT "profile_field_provenance_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
