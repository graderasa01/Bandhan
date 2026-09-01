-- CreateEnum
CREATE TYPE "ManagedDraftCreatorKind" AS ENUM ('PARTNER', 'FAMILY');

-- CreateEnum
CREATE TYPE "ManagedDraftStatus" AS ENUM ('DRAFT', 'INVITED', 'CLAIMED', 'UNDER_REVIEW', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ManagedFieldReviewState" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'REPLACED');

-- CreateEnum
CREATE TYPE "ProfileDelegationStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ProfileDelegatePermission" AS ENUM ('VIEW_CONFIRMED_PROFILE', 'PROPOSE_PROFILE_EDIT', 'VIEW_REVIEW_STATUS');

-- CreateEnum
CREATE TYPE "ConsentEventKind" AS ENUM ('DRAFT_CREATED', 'CLAIM_LINK_ISSUED', 'CLAIM_LINK_REGENERATED', 'CLAIM_LINK_REVOKED', 'DRAFT_CLAIMED', 'DRAFT_CANCELLED', 'FIELD_ACCEPTED', 'SENSITIVE_FIELD_ACCEPTED', 'FIELD_REPLACED', 'FIELD_REJECTED', 'REVIEW_COMPLETED', 'DELEGATION_GRANTED', 'DELEGATION_EXPIRY_CHANGED', 'DELEGATION_REVOKED', 'DELEGATION_DECLINED');

-- AlterEnum
ALTER TYPE "RespondentType" ADD VALUE 'PARTNER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SignalSource" ADD VALUE 'PARTNER_ENTERED';
ALTER TYPE "SignalSource" ADD VALUE 'FAMILY_ENTERED';

-- CreateTable
CREATE TABLE "managed_profile_drafts" (
    "id" TEXT NOT NULL,
    "creatorKind" "ManagedDraftCreatorKind" NOT NULL,
    "status" "ManagedDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "creatorUserId" TEXT NOT NULL,
    "partnerId" TEXT,
    "fillingForGender" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "claimIssuedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "reviewStartedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managed_profile_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_profile_draft_fields" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" "SignalSource" NOT NULL DEFAULT 'USER_ENTERED',
    "sourceContext" TEXT,
    "confidence" INTEGER,
    "proposedByUserId" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewState" "ManagedFieldReviewState" NOT NULL DEFAULT 'PROPOSED',
    "reviewedAt" TIMESTAMP(3),
    "ownerValue" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managed_profile_draft_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_draft_claim_tokens" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "managed_draft_claim_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_delegations" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "delegateUserId" TEXT,
    "partnerId" TEXT,
    "familyMemberId" TEXT,
    "sourceDraftId" TEXT,
    "status" "ProfileDelegationStatus" NOT NULL DEFAULT 'PENDING',
    "permissions" "ProfileDelegatePermission"[],
    "consentText" TEXT NOT NULL,
    "consentVersion" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "id" TEXT NOT NULL,
    "kind" "ConsentEventKind" NOT NULL,
    "ownerUserId" TEXT,
    "actorUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "draftId" TEXT,
    "delegationId" TEXT,
    "fieldKey" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "managed_profile_drafts_creatorUserId_status_idx" ON "managed_profile_drafts"("creatorUserId", "status");

-- CreateIndex
CREATE INDEX "managed_profile_drafts_partnerId_status_idx" ON "managed_profile_drafts"("partnerId", "status");

-- CreateIndex
CREATE INDEX "managed_profile_drafts_claimedByUserId_idx" ON "managed_profile_drafts"("claimedByUserId");

-- CreateIndex
CREATE INDEX "managed_profile_draft_fields_draftId_reviewState_idx" ON "managed_profile_draft_fields"("draftId", "reviewState");

-- CreateIndex
CREATE UNIQUE INDEX "managed_profile_draft_fields_draftId_fieldKey_key" ON "managed_profile_draft_fields"("draftId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "managed_draft_claim_tokens_tokenHash_key" ON "managed_draft_claim_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "managed_draft_claim_tokens_draftId_revokedAt_idx" ON "managed_draft_claim_tokens"("draftId", "revokedAt");

-- CreateIndex
CREATE INDEX "profile_delegations_ownerUserId_status_idx" ON "profile_delegations"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "profile_delegations_delegateUserId_status_idx" ON "profile_delegations"("delegateUserId", "status");

-- CreateIndex
CREATE INDEX "profile_delegations_partnerId_status_idx" ON "profile_delegations"("partnerId", "status");

-- CreateIndex
CREATE INDEX "consent_events_ownerUserId_createdAt_idx" ON "consent_events"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "consent_events_draftId_createdAt_idx" ON "consent_events"("draftId", "createdAt");

-- AddForeignKey
ALTER TABLE "managed_profile_drafts" ADD CONSTRAINT "managed_profile_drafts_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_profile_drafts" ADD CONSTRAINT "managed_profile_drafts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_profile_drafts" ADD CONSTRAINT "managed_profile_drafts_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_profile_draft_fields" ADD CONSTRAINT "managed_profile_draft_fields_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "managed_profile_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_draft_claim_tokens" ADD CONSTRAINT "managed_draft_claim_tokens_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "managed_profile_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_delegations" ADD CONSTRAINT "profile_delegations_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_delegations" ADD CONSTRAINT "profile_delegations_delegateUserId_fkey" FOREIGN KEY ("delegateUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_delegations" ADD CONSTRAINT "profile_delegations_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_delegations" ADD CONSTRAINT "profile_delegations_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_delegations" ADD CONSTRAINT "profile_delegations_sourceDraftId_fkey" FOREIGN KEY ("sourceDraftId") REFERENCES "managed_profile_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "managed_profile_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
