-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('SUBSCRIPTION', 'ITEM');

-- CreateEnum
CREATE TYPE "ServiceItemKind" AS ENUM ('ENTITLEMENT_WINDOW', 'SPOTLIGHT_CAMPAIGN', 'AI_DELIVERABLE');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "itemCode" TEXT,
ADD COLUMN     "itemRefId" TEXT,
ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'SUBSCRIPTION',
ALTER COLUMN "planCode" DROP NOT NULL;

-- CreateTable
CREATE TABLE "service_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceInPaise" INTEGER NOT NULL,
    "kind" "ServiceItemKind" NOT NULL,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_items_code_key" ON "service_items"("code");
