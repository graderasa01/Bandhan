-- CreateEnum
CREATE TYPE "PartnerKycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartnerKycDocKind" AS ENUM ('PAN_CARD', 'ID_PROOF', 'BANK_PROOF');

-- CreateEnum
CREATE TYPE "PartnerKycDocStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "partner_commission_config" ADD COLUMN     "requireKycForPayout" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "partner_kyc" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "panCipher" TEXT,
    "panIv" TEXT,
    "panTag" TEXT,
    "panLast4" TEXT,
    "legalName" TEXT,
    "status" "PartnerKycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_kyc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_kyc_documents" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" "PartnerKycDocKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "status" "PartnerKycDocStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionNote" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "partner_kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_kyc_partnerId_key" ON "partner_kyc"("partnerId");

-- CreateIndex
CREATE INDEX "partner_kyc_status_submittedAt_idx" ON "partner_kyc"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "partner_kyc_documents_status_uploadedAt_idx" ON "partner_kyc_documents"("status", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "partner_kyc_documents_partnerId_kind_key" ON "partner_kyc_documents"("partnerId", "kind");

-- AddForeignKey
ALTER TABLE "partner_kyc" ADD CONSTRAINT "partner_kyc_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_kyc_documents" ADD CONSTRAINT "partner_kyc_documents_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner_kyc"("partnerId") ON DELETE CASCADE ON UPDATE CASCADE;
