-- CreateEnum
CREATE TYPE "RishtaStage" AS ENUM ('DISCOVERED', 'INTERESTED', 'MUTUAL_MATCH', 'TALKING', 'UNDERSTANDING', 'FAMILY_INVOLVED', 'MEETING_PLANNED', 'MET', 'DECISION', 'CLOSED');

-- CreateTable
CREATE TABLE "rishta_journeys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otherUserId" TEXT NOT NULL,
    "confirmedStage" "RishtaStage",
    "confirmedStageAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rishta_journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rishta_topics" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "questionKey" TEXT,
    "label" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rishta_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rishta_meetings" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "happenedAt" TIMESTAMP(3),
    "place" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rishta_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rishta_reflections" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rishta_reflections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rishta_journeys_userId_idx" ON "rishta_journeys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "rishta_journeys_userId_otherUserId_key" ON "rishta_journeys"("userId", "otherUserId");

-- CreateIndex
CREATE INDEX "rishta_topics_journeyId_resolved_idx" ON "rishta_topics"("journeyId", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "rishta_topics_journeyId_label_key" ON "rishta_topics"("journeyId", "label");

-- CreateIndex
CREATE INDEX "rishta_meetings_journeyId_idx" ON "rishta_meetings"("journeyId");

-- CreateIndex
CREATE INDEX "rishta_reflections_journeyId_createdAt_idx" ON "rishta_reflections"("journeyId", "createdAt");

-- AddForeignKey
ALTER TABLE "rishta_journeys" ADD CONSTRAINT "rishta_journeys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rishta_topics" ADD CONSTRAINT "rishta_topics_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "rishta_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rishta_meetings" ADD CONSTRAINT "rishta_meetings_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "rishta_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rishta_reflections" ADD CONSTRAINT "rishta_reflections_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "rishta_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
