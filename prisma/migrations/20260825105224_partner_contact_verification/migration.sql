-- CreateEnum
CREATE TYPE "VerificationScope" AS ENUM ('USER', 'PARTNER');

-- DropIndex
DROP INDEX "contact_verification_challenges_userId_channel_createdAt_idx";

-- AlterTable
ALTER TABLE "contact_verification_challenges" ADD COLUMN     "scope" "VerificationScope" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "mobileVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "contact_verification_challenges_userId_scope_channel_create_idx" ON "contact_verification_challenges"("userId", "scope", "channel", "createdAt");
