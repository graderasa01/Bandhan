-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('UPI', 'BANK');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "partner_commission_config" ADD COLUMN     "autoApproveAfterMaturity" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maturityDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "minWithdrawalPaise" INTEGER NOT NULL DEFAULT 50000;

-- AlterTable
ALTER TABLE "partner_commissions" ADD COLUMN     "maturesAt" TIMESTAMP(3),
ADD COLUMN     "withdrawalId" TEXT;

-- CreateTable
CREATE TABLE "partner_payout_accounts" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "upiCipher" TEXT,
    "upiIv" TEXT,
    "upiTag" TEXT,
    "upiLast4" TEXT,
    "accountCipher" TEXT,
    "accountIv" TEXT,
    "accountTag" TEXT,
    "accountLast4" TEXT,
    "ifsc" TEXT,
    "bankName" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "rejectedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_withdrawals" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "utr" TEXT,
    "providerRef" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "partner_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_payout_accounts_partnerId_key" ON "partner_payout_accounts"("partnerId");

-- CreateIndex
CREATE INDEX "partner_withdrawals_partnerId_status_idx" ON "partner_withdrawals"("partnerId", "status");

-- CreateIndex
CREATE INDEX "partner_withdrawals_status_requestedAt_idx" ON "partner_withdrawals"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "partner_commissions_withdrawalId_idx" ON "partner_commissions"("withdrawalId");

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "partner_withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_payout_accounts" ADD CONSTRAINT "partner_payout_accounts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_withdrawals" ADD CONSTRAINT "partner_withdrawals_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
