-- AlterEnum
ALTER TYPE "SpotlightCampaignStatus" ADD VALUE 'ENDED_SHORT';

-- AlterEnum
ALTER TYPE "NoticeKind" ADD VALUE 'SPOTLIGHT_UPDATE';

-- AlterTable
ALTER TABLE "spotlight_campaigns" ADD COLUMN     "refundPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refundedPaise" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "daily_reel_profiles" ADD COLUMN     "spotlightCampaignId" TEXT;

-- CreateTable
CREATE TABLE "spotlight_deliveries" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "surface" TEXT NOT NULL DEFAULT 'reel',
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotlight_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spotlight_deliveries_viewerUserId_deliveredAt_idx" ON "spotlight_deliveries"("viewerUserId", "deliveredAt");

-- CreateIndex
-- The promise, as a constraint: one campaign can reach one person once, so
-- `deliveredReach` can never climb above the people it actually named.
CREATE UNIQUE INDEX "spotlight_deliveries_campaignId_viewerUserId_key" ON "spotlight_deliveries"("campaignId", "viewerUserId");

-- CreateIndex
CREATE INDEX "daily_reel_profiles_spotlightCampaignId_idx" ON "daily_reel_profiles"("spotlightCampaignId");

-- AddForeignKey
ALTER TABLE "spotlight_deliveries" ADD CONSTRAINT "spotlight_deliveries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "spotlight_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_deliveries" ADD CONSTRAINT "spotlight_deliveries_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull, not Cascade: deleting a campaign must not delete somebody's reel
-- history. The card stops being labelled; it does not vanish from the deck it
-- was already shown in.
ALTER TABLE "daily_reel_profiles" ADD CONSTRAINT "daily_reel_profiles_spotlightCampaignId_fkey" FOREIGN KEY ("spotlightCampaignId") REFERENCES "spotlight_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
