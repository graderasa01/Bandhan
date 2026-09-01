-- CreateEnum
CREATE TYPE "VerificationChannel" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "DiscoveryFilterMode" AS ENUM ('FLEXIBLE', 'STRICT');

-- CreateTable
CREATE TABLE "contact_verification_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "VerificationChannel" NOT NULL,
    "destinationMasked" TEXT NOT NULL,
    "destinationHash" TEXT NOT NULL,
    "providerRef" TEXT,
    "codeHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_verification_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_settings" (
    "userId" TEXT NOT NULL,
    "filterMode" "DiscoveryFilterMode" NOT NULL DEFAULT 'FLEXIBLE',
    "verifiedOnly" BOOLEAN NOT NULL DEFAULT false,
    "minTrustScore" INTEGER,
    "behaviorLearningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "behaviorResetAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "contact_verification_challenges_userId_channel_createdAt_idx" ON "contact_verification_challenges"("userId", "channel", "createdAt");

-- AddForeignKey
ALTER TABLE "contact_verification_challenges" ADD CONSTRAINT "contact_verification_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_settings" ADD CONSTRAINT "discovery_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
