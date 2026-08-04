-- CreateEnum
CREATE TYPE "MatchmakerRequestStatus" AS ENUM ('OPEN', 'CONTACTED', 'RESOLVED');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "boostActiveUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "matchmaker_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "status" "MatchmakerRequestStatus" NOT NULL DEFAULT 'OPEN',
    "handledBy" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matchmaker_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matchmaker_requests_status_createdAt_idx" ON "matchmaker_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "matchmaker_requests" ADD CONSTRAINT "matchmaker_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
