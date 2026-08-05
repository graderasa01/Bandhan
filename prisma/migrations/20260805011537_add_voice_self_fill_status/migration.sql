-- CreateEnum
CREATE TYPE "VoiceSelfFillStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "voiceSelfFillReason" TEXT,
ADD COLUMN     "voiceSelfFillReviewNote" TEXT,
ADD COLUMN     "voiceSelfFillReviewedAt" TIMESTAMP(3),
ADD COLUMN     "voiceSelfFillReviewedBy" TEXT,
ADD COLUMN     "voiceSelfFillStatus" "VoiceSelfFillStatus" NOT NULL DEFAULT 'NOT_REQUESTED';
