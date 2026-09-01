-- CreateEnum
CREATE TYPE "RishtaOutcome" AS ENUM ('ENGAGED', 'MARRIED', 'NOT_A_FIT', 'FAMILY_SAID_NO', 'NO_REPLY', 'CHANGED_MY_MIND', 'SAFETY_CONCERN');

-- AlterTable
ALTER TABLE "rishta_journeys" ADD COLUMN     "outcome" "RishtaOutcome",
ADD COLUMN     "outcomeAt" TIMESTAMP(3);
