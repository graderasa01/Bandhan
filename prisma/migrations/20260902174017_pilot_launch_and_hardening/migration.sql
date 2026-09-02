-- CreateEnum
CREATE TYPE "PilotCityStatus" AS ENUM ('OPEN', 'WAITLIST', 'PAUSED');

-- CreateEnum
CREATE TYPE "CityDemandReason" AS ENUM ('NO_PILOT_CITY', 'ALL_PARTNERS_FULL', 'NO_PARTNER_FOR_KIND');

-- CreateEnum
CREATE TYPE "SafetyCaseSource" AS ENUM ('RISHTA_CLOSURE', 'MEETING_CHECKPOINT', 'SERVICE_DISPUTE');

-- CreateEnum
CREATE TYPE "SafetyCaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ACTION_TAKEN', 'CLOSED_NO_ACTION');

-- AlterTable
ALTER TABLE "partner_availability" ADD COLUMN     "autoPauseReason" TEXT,
ADD COLUMN     "autoPausedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_bookings" ADD COLUMN     "acceptFinalReminderAt" TIMESTAMP(3),
ADD COLUMN     "acceptReminderAt" TIMESTAMP(3),
ADD COLUMN     "ackReminderAt" TIMESTAMP(3),
ADD COLUMN     "slaEscalatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_milestones" ADD COLUMN     "overdueReminderAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pilot_cities" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" "PilotCityStatus" NOT NULL DEFAULT 'WAITLIST',
    "partnerCapacity" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "pilot_cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_demand_signals" (
    "id" TEXT NOT NULL,
    "citySlug" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "pilotCityId" TEXT,
    "userId" TEXT NOT NULL,
    "reason" "CityDemandReason" NOT NULL,
    "serviceKind" "PartnerServiceKind",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "city_demand_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_settings" (
    "id" TEXT NOT NULL,
    "defaultCityPartnerCapacity" INTEGER NOT NULL DEFAULT 12,
    "demandSignalThreshold" INTEGER NOT NULL DEFAULT 5,
    "slaFirstReminderHours" INTEGER NOT NULL DEFAULT 24,
    "slaFinalReminderHours" INTEGER NOT NULL DEFAULT 6,
    "ackReminderHours" INTEGER NOT NULL DEFAULT 24,
    "milestoneOverdueGraceDays" INTEGER NOT NULL DEFAULT 2,
    "slaBreachEscalationCount" INTEGER NOT NULL DEFAULT 2,
    "slaBreachWindowDays" INTEGER NOT NULL DEFAULT 30,
    "slaAutoPauseOnEscalation" BOOLEAN NOT NULL DEFAULT true,
    "safetyFirstResponseHours" INTEGER NOT NULL DEFAULT 4,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ops_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_cases" (
    "id" TEXT NOT NULL,
    "source" "SafetyCaseSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "raisedByUserId" TEXT NOT NULL,
    "aboutUserId" TEXT,
    "partnerId" TEXT,
    "status" "SafetyCaseStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "stepsDone" TEXT[],
    "reportId" TEXT,
    "resolutionNote" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pilot_cities_slug_key" ON "pilot_cities"("slug");

-- CreateIndex
CREATE INDEX "pilot_cities_status_idx" ON "pilot_cities"("status");

-- CreateIndex
CREATE INDEX "city_demand_signals_citySlug_notifiedAt_idx" ON "city_demand_signals"("citySlug", "notifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "city_demand_signals_userId_citySlug_key" ON "city_demand_signals"("userId", "citySlug");

-- CreateIndex
CREATE INDEX "safety_cases_status_openedAt_idx" ON "safety_cases"("status", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "safety_cases_source_sourceId_key" ON "safety_cases"("source", "sourceId");

-- AddForeignKey
ALTER TABLE "city_demand_signals" ADD CONSTRAINT "city_demand_signals_pilotCityId_fkey" FOREIGN KEY ("pilotCityId") REFERENCES "pilot_cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "city_demand_signals" ADD CONSTRAINT "city_demand_signals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_cases" ADD CONSTRAINT "safety_cases_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_cases" ADD CONSTRAINT "safety_cases_aboutUserId_fkey" FOREIGN KEY ("aboutUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_cases" ADD CONSTRAINT "safety_cases_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
