-- AlterTable
ALTER TABLE "spotlight_campaigns" ADD COLUMN     "refundNote" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "spotlight_deliveries" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "dailyReelProfileId" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotlight_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spotlight_deliveries_dailyReelProfileId_key" ON "spotlight_deliveries"("dailyReelProfileId");

-- CreateIndex
CREATE INDEX "spotlight_deliveries_viewerUserId_deliveredAt_idx" ON "spotlight_deliveries"("viewerUserId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "spotlight_deliveries_campaignId_viewerUserId_key" ON "spotlight_deliveries"("campaignId", "viewerUserId");

-- AddForeignKey
ALTER TABLE "spotlight_deliveries" ADD CONSTRAINT "spotlight_deliveries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "spotlight_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_deliveries" ADD CONSTRAINT "spotlight_deliveries_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_deliveries" ADD CONSTRAINT "spotlight_deliveries_dailyReelProfileId_fkey" FOREIGN KEY ("dailyReelProfileId") REFERENCES "daily_reel_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
