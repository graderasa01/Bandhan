-- CreateEnum
CREATE TYPE "PartnerTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "OutreachTrigger" AS ENUM ('MANUAL', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "partner_commission_config" DROP COLUMN "flatAmountPaise",
ADD COLUMN     "baseBps" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "goldBonusBps" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "goldThreshold" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "silverBonusBps" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "silverThreshold" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "partner_commissions" ADD COLUMN     "basePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "percentBpsApplied" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tierAtEarning" "PartnerTier" NOT NULL DEFAULT 'BRONZE';

-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "autoOutreachEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "partner_outreach_messages" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "trigger" "OutreachTrigger" NOT NULL DEFAULT 'MANUAL',
    "templateKey" TEXT NOT NULL,
    "leadStatusAtSend" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "providerRef" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_outreach_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_outreach_messages_partnerId_createdAt_idx" ON "partner_outreach_messages"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_outreach_messages_userId_templateKey_createdAt_idx" ON "partner_outreach_messages"("userId", "templateKey", "createdAt");

-- AddForeignKey
ALTER TABLE "partner_outreach_messages" ADD CONSTRAINT "partner_outreach_messages_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_outreach_messages" ADD CONSTRAINT "partner_outreach_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
