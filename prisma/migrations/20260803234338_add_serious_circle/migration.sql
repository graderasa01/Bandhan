-- CreateEnum
CREATE TYPE "CircleEventStatus" AS ENUM ('SCHEDULED', 'LOCKED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CircleEntryStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MarriageTimeline" AS ENUM ('WITHIN_3_MONTHS', 'WITHIN_6_MONTHS', 'WITHIN_1_YEAR');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "marriageTimeline" "MarriageTimeline";

-- CreateTable
CREATE TABLE "circle_events" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "registrationClosesAt" TIMESTAMP(3) NOT NULL,
    "status" "CircleEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "minParticipants" INTEGER NOT NULL DEFAULT 20,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_entries" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CircleEntryStatus" NOT NULL DEFAULT 'REGISTERED',
    "timeline" "MarriageTimeline" NOT NULL,
    "gender" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendedAt" TIMESTAMP(3),

    CONSTRAINT "circle_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_connections" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "aAnsweredAt" TIMESTAMP(3),
    "aAccepted" BOOLEAN,
    "bAnsweredAt" TIMESTAMP(3),
    "bAccepted" BOOLEAN,
    "connectedAt" TIMESTAMP(3),
    "windowEndsAt" TIMESTAMP(3),
    "matchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serious_badges" (
    "userId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "suspendedUntil" TIMESTAMP(3),
    "suspendReason" TEXT,
    "eventsAttended" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serious_badges_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "circle_events_slug_key" ON "circle_events"("slug");

-- CreateIndex
CREATE INDEX "circle_events_status_startsAt_idx" ON "circle_events"("status", "startsAt");

-- CreateIndex
CREATE INDEX "circle_entries_eventId_status_idx" ON "circle_entries"("eventId", "status");

-- CreateIndex
CREATE INDEX "circle_entries_userId_idx" ON "circle_entries"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "circle_entries_eventId_userId_key" ON "circle_entries"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "circle_connections_matchId_key" ON "circle_connections"("matchId");

-- CreateIndex
CREATE INDEX "circle_connections_eventId_rank_idx" ON "circle_connections"("eventId", "rank");

-- CreateIndex
CREATE INDEX "circle_connections_userAId_idx" ON "circle_connections"("userAId");

-- CreateIndex
CREATE INDEX "circle_connections_userBId_idx" ON "circle_connections"("userBId");

-- CreateIndex
CREATE UNIQUE INDEX "circle_connections_eventId_userAId_userBId_key" ON "circle_connections"("eventId", "userAId", "userBId");

-- CreateIndex
CREATE INDEX "serious_badges_expiresAt_idx" ON "serious_badges"("expiresAt");

-- AddForeignKey
ALTER TABLE "circle_entries" ADD CONSTRAINT "circle_entries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "circle_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_entries" ADD CONSTRAINT "circle_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_connections" ADD CONSTRAINT "circle_connections_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "circle_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_connections" ADD CONSTRAINT "circle_connections_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_connections" ADD CONSTRAINT "circle_connections_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serious_badges" ADD CONSTRAINT "serious_badges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
