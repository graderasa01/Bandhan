-- CreateEnum
CREATE TYPE "RishtaMeetingFeeling" AS ENUM ('WENT_WELL', 'UNSURE', 'NOT_RIGHT', 'FELT_UNSAFE');

-- CreateEnum
CREATE TYPE "RishtaParticipantStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "RishtaTaskParty" AS ENUM ('OWNER', 'FAMILY', 'PARTNER');

-- CreateEnum
CREATE TYPE "RishtaRequestKind" AS ENUM ('FAMILY_INTRO', 'CALL', 'MEETING');

-- CreateEnum
CREATE TYPE "RishtaRequestStatus" AS ENUM ('PROPOSED', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsentEventKind" ADD VALUE 'RISHTA_PARTICIPANT_ADMITTED';
ALTER TYPE "ConsentEventKind" ADD VALUE 'RISHTA_PARTICIPANT_REMOVED';
ALTER TYPE "ConsentEventKind" ADD VALUE 'RISHTA_REQUEST_RAISED';
ALTER TYPE "ConsentEventKind" ADD VALUE 'RISHTA_REQUEST_APPROVED';
ALTER TYPE "ConsentEventKind" ADD VALUE 'RISHTA_REQUEST_DECLINED';
ALTER TYPE "ConsentEventKind" ADD VALUE 'RISHTA_TASK_ASSIGNED';

-- AlterEnum
ALTER TYPE "NoticeKind" ADD VALUE 'RISHTA_REQUEST';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfileDelegatePermission" ADD VALUE 'REQUEST_FAMILY_INTRO';
ALTER TYPE "ProfileDelegatePermission" ADD VALUE 'REQUEST_CALL';
ALTER TYPE "ProfileDelegatePermission" ADD VALUE 'REQUEST_MEETING';

-- AlterTable
ALTER TABLE "rishta_meetings" ADD COLUMN     "checkpointAt" TIMESTAMP(3),
ADD COLUMN     "checkpointFeeling" "RishtaMeetingFeeling",
ADD COLUMN     "checkpointNote" TEXT;

-- AlterTable
ALTER TABLE "service_bookings" ADD COLUMN     "rishtaOtherUserId" TEXT;

-- CreateTable
CREATE TABLE "rishta_participants" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "delegationId" TEXT NOT NULL,
    "status" "RishtaParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "admittedBy" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "rishta_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rishta_tasks" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "party" "RishtaTaskParty" NOT NULL,
    "participantId" TEXT,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneByLabel" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rishta_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rishta_requests" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "kind" "RishtaRequestKind" NOT NULL,
    "status" "RishtaRequestStatus" NOT NULL DEFAULT 'PROPOSED',
    "note" TEXT NOT NULL,
    "proposedFor" TIMESTAMP(3),
    "proposedPlace" TEXT,
    "raisedByUserId" TEXT,
    "raisedByLabel" TEXT NOT NULL,
    "ownerDecidedAt" TIMESTAMP(3),
    "ownerNote" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "meetingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rishta_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rishta_participants_delegationId_status_idx" ON "rishta_participants"("delegationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rishta_participants_journeyId_delegationId_key" ON "rishta_participants"("journeyId", "delegationId");

-- CreateIndex
CREATE INDEX "rishta_tasks_journeyId_doneAt_idx" ON "rishta_tasks"("journeyId", "doneAt");

-- CreateIndex
CREATE INDEX "rishta_tasks_participantId_doneAt_idx" ON "rishta_tasks"("participantId", "doneAt");

-- CreateIndex
CREATE UNIQUE INDEX "rishta_requests_meetingId_key" ON "rishta_requests"("meetingId");

-- CreateIndex
CREATE INDEX "rishta_requests_journeyId_status_idx" ON "rishta_requests"("journeyId", "status");

-- CreateIndex
CREATE INDEX "rishta_requests_participantId_status_idx" ON "rishta_requests"("participantId", "status");

-- CreateIndex
CREATE INDEX "service_bookings_buyerUserId_rishtaOtherUserId_idx" ON "service_bookings"("buyerUserId", "rishtaOtherUserId");

-- AddForeignKey
ALTER TABLE "rishta_participants" ADD CONSTRAINT "rishta_participants_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "rishta_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rishta_participants" ADD CONSTRAINT "rishta_participants_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "profile_delegations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rishta_tasks" ADD CONSTRAINT "rishta_tasks_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "rishta_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rishta_tasks" ADD CONSTRAINT "rishta_tasks_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "rishta_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rishta_requests" ADD CONSTRAINT "rishta_requests_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "rishta_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rishta_requests" ADD CONSTRAINT "rishta_requests_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "rishta_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rishta_requests" ADD CONSTRAINT "rishta_requests_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "rishta_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
