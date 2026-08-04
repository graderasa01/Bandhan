-- CreateEnum
CREATE TYPE "ShareLinkKind" AS ENUM ('OWN_BIODATA', 'RISHTA_CARD');

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "kind" "ShareLinkKind" NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "includeMobile" BOOLEAN NOT NULL DEFAULT false,
    "includeIncome" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

-- CreateIndex
CREATE INDEX "share_links_profileId_idx" ON "share_links"("profileId");

-- CreateIndex
CREATE INDEX "share_links_createdByUserId_idx" ON "share_links"("createdByUserId");

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
