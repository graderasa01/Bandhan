-- CreateEnum
CREATE TYPE "PlanOfferKind" AS ENUM ('PERCENT', 'FLAT', 'FREE');

-- CreateTable
CREATE TABLE "plan_offers" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "kind" "PlanOfferKind" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "plan_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_offers_planCode_isActive_startsAt_endsAt_idx" ON "plan_offers"("planCode", "isActive", "startsAt", "endsAt");
