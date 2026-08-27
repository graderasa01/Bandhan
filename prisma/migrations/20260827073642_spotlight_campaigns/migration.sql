-- CreateEnum
CREATE TYPE "SpotlightCampaignStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "spotlight_campaigns" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "paymentId" TEXT,
    "status" "SpotlightCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "cities" TEXT[],
    "minAge" INTEGER NOT NULL,
    "maxAge" INTEGER NOT NULL,
    "targetGender" TEXT NOT NULL,
    "promisedReach" INTEGER NOT NULL,
    "maxDays" INTEGER NOT NULL,
    "deliveredReach" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotlight_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spotlight_campaigns_paymentId_key" ON "spotlight_campaigns"("paymentId");

-- CreateIndex
CREATE INDEX "spotlight_campaigns_status_endsAt_idx" ON "spotlight_campaigns"("status", "endsAt");

-- CreateIndex
CREATE INDEX "spotlight_campaigns_ownerUserId_status_idx" ON "spotlight_campaigns"("ownerUserId", "status");

-- AddForeignKey
ALTER TABLE "spotlight_campaigns" ADD CONSTRAINT "spotlight_campaigns_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
