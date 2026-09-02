-- CreateEnum
CREATE TYPE "VerificationKind" AS ENUM ('CONTACT_PHONE', 'CONTACT_EMAIL', 'PHOTO', 'IDENTITY', 'EDUCATION', 'EMPLOYMENT', 'MARRIAGE_INTENT', 'HUMAN_INTERVIEW');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('MATCHED', 'MISMATCH', 'COULD_NOT_COMPLETE');

-- CreateEnum
CREATE TYPE "VerificationPayer" AS ENUM ('REQUESTER', 'SUBJECT', 'SPLIT');

-- CreateEnum
CREATE TYPE "VerificationRequestStatus" AS ENUM ('AWAITING_PAYMENT', 'AWAITING_SUBJECT', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'COMPLETED');

-- AlterEnum
ALTER TYPE "NoticeKind" ADD VALUE 'VERIFICATION_UPDATE';

-- AlterEnum
ALTER TYPE "PaymentKind" ADD VALUE 'VERIFICATION';

-- CreateTable
CREATE TABLE "verification_checks" (
    "id" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "kind" "VerificationKind" NOT NULL,
    "outcome" "VerificationOutcome",
    "scopeText" TEXT NOT NULL DEFAULT '',
    "assignedToUserId" TEXT,
    "evidenceNote" TEXT,
    "resultNote" TEXT,
    "checkedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "kind" "VerificationKind" NOT NULL,
    "status" "VerificationRequestStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "payer" "VerificationPayer" NOT NULL,
    "feePaise" INTEGER NOT NULL,
    "requesterPaise" INTEGER NOT NULL,
    "subjectPaise" INTEGER NOT NULL,
    "requesterPaymentId" TEXT,
    "subjectPaymentId" TEXT,
    "message" TEXT,
    "subjectDecidedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "checkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_checks_subjectUserId_kind_idx" ON "verification_checks"("subjectUserId", "kind");

-- CreateIndex
CREATE INDEX "verification_checks_outcome_createdAt_idx" ON "verification_checks"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "verification_checks_assignedToUserId_outcome_idx" ON "verification_checks"("assignedToUserId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "verification_requests_requesterPaymentId_key" ON "verification_requests"("requesterPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_requests_subjectPaymentId_key" ON "verification_requests"("subjectPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_requests_checkId_key" ON "verification_requests"("checkId");

-- CreateIndex
CREATE INDEX "verification_requests_subjectUserId_status_idx" ON "verification_requests"("subjectUserId", "status");

-- CreateIndex
CREATE INDEX "verification_requests_requesterUserId_status_idx" ON "verification_requests"("requesterUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "verification_requests_requesterUserId_subjectUserId_kind_key" ON "verification_requests"("requesterUserId", "subjectUserId", "kind");

-- AddForeignKey
ALTER TABLE "verification_checks" ADD CONSTRAINT "verification_checks_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_requesterPaymentId_fkey" FOREIGN KEY ("requesterPaymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_subjectPaymentId_fkey" FOREIGN KEY ("subjectPaymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "verification_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
