-- CreateEnum
CREATE TYPE "PartnerRecoveryStatus" AS ENUM ('OPEN', 'SETTLED', 'WAIVED');

-- CreateTable
CREATE TABLE "partner_recoveries" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "allocationId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "settledPaise" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" "PartnerRecoveryStatus" NOT NULL DEFAULT 'OPEN',
    "settledWithdrawalId" TEXT,
    "settledAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "waivedBy" TEXT,
    "waiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_recoveries_allocationId_key" ON "partner_recoveries"("allocationId");

-- CreateIndex
CREATE INDEX "partner_recoveries_partnerId_status_idx" ON "partner_recoveries"("partnerId", "status");

-- AddForeignKey
ALTER TABLE "partner_recoveries" ADD CONSTRAINT "partner_recoveries_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_recoveries" ADD CONSTRAINT "partner_recoveries_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "service_payment_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_recoveries" ADD CONSTRAINT "partner_recoveries_settledWithdrawalId_fkey" FOREIGN KEY ("settledWithdrawalId") REFERENCES "partner_withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
