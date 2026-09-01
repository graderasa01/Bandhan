-- CreateEnum
CREATE TYPE "ProposalSource" AS ENUM ('PARTNER_SEARCH', 'PARTNER_OFFLINE');

-- CreateEnum
CREATE TYPE "CandidateProposalStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsentEventKind" ADD VALUE 'PARTNER_SEARCH_RUN';
ALTER TYPE "ConsentEventKind" ADD VALUE 'CANDIDATE_PROPOSED';
ALTER TYPE "ConsentEventKind" ADD VALUE 'PROPOSAL_ACCEPTED';
ALTER TYPE "ConsentEventKind" ADD VALUE 'PROPOSAL_REJECTED';
ALTER TYPE "ConsentEventKind" ADD VALUE 'PROPOSAL_WITHDRAWN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfileDelegatePermission" ADD VALUE 'SEARCH_FOR_CLIENT';
ALTER TYPE "ProfileDelegatePermission" ADD VALUE 'PROPOSE_SHORTLIST';
ALTER TYPE "ProfileDelegatePermission" ADD VALUE 'DRAFT_MESSAGE';

-- AlterTable
ALTER TABLE "shortlists" ADD COLUMN     "addedByPartnerId" TEXT;

-- CreateTable
CREATE TABLE "candidate_proposals" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "proposedByUserId" TEXT NOT NULL,
    "candidateProfileId" TEXT NOT NULL,
    "status" "CandidateProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "source" "ProposalSource" NOT NULL DEFAULT 'PARTNER_SEARCH',
    "reason" TEXT NOT NULL,
    "draftMessage" TEXT,
    "fitScore" INTEGER,
    "fitSummary" TEXT,
    "ownerDecidedAt" TIMESTAMP(3),
    "ownerNote" TEXT,
    "shortlistId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_client_notes" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_proposals_ownerUserId_status_idx" ON "candidate_proposals"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "candidate_proposals_partnerId_status_idx" ON "candidate_proposals"("partnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_proposals_ownerUserId_candidateProfileId_key" ON "candidate_proposals"("ownerUserId", "candidateProfileId");

-- CreateIndex
CREATE INDEX "partner_client_notes_partnerId_ownerUserId_createdAt_idx" ON "partner_client_notes"("partnerId", "ownerUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_addedByPartnerId_fkey" FOREIGN KEY ("addedByPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_proposals" ADD CONSTRAINT "candidate_proposals_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_proposals" ADD CONSTRAINT "candidate_proposals_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_proposals" ADD CONSTRAINT "candidate_proposals_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_client_notes" ADD CONSTRAINT "partner_client_notes_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
