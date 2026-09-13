-- CreateEnum
CREATE TYPE "MarketingMediaStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'INVALID');

-- CreateEnum
CREATE TYPE "MarketingMediaSource" AS ENUM ('ADMIN_UPLOAD', 'AI_RENDER', 'TEMPLATE_RENDER');

-- CreateTable
CREATE TABLE "marketing_creative_media" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "creativeAssetId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "source" "MarketingMediaSource" NOT NULL DEFAULT 'ADMIN_UPLOAD',
    "status" "MarketingMediaStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "productionReady" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "providerRefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_creative_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_creative_media_taskId_idx" ON "marketing_creative_media"("taskId");

-- CreateIndex
CREATE INDEX "marketing_creative_media_creativeAssetId_status_idx" ON "marketing_creative_media"("creativeAssetId", "status");

-- AddForeignKey
ALTER TABLE "marketing_creative_media" ADD CONSTRAINT "marketing_creative_media_creativeAssetId_fkey" FOREIGN KEY ("creativeAssetId") REFERENCES "creative_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
