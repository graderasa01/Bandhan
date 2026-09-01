-- CreateEnum
CREATE TYPE "PartnerServiceKind" AS ENUM ('INTRO_CALL', 'PROFILE_SETUP', 'CURATED_SHORTLIST', 'ASSISTED_SEARCH', 'FAMILY_COORDINATION', 'MEETING_COORDINATION');

-- CreateEnum
CREATE TYPE "ServiceBookingStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'EXPIRED_UNACCEPTED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ServiceMilestoneStatus" AS ENUM ('PENDING', 'SUBMITTED', 'ACCEPTED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ServiceAllocationStatus" AS ENUM ('HELD', 'RELEASED', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "EnquiryAuthor" AS ENUM ('USER', 'PARTNER');

-- AlterEnum
ALTER TYPE "NoticeKind" ADD VALUE 'SERVICE_UPDATE';

-- AlterEnum
ALTER TYPE "PaymentKind" ADD VALUE 'SERVICE_BOOKING';

-- AlterTable
ALTER TABLE "partner_commission_config" ADD COLUMN     "serviceAcceptSlaHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "servicePlatformFeeBps" INTEGER NOT NULL DEFAULT 1500,
ADD COLUMN     "serviceRefundWindowDays" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "partner_marketplace_profiles" (
    "partnerId" TEXT NOT NULL,
    "isListed" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionNote" TEXT,
    "headline" TEXT,
    "about" TEXT,
    "languages" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_marketplace_profiles_pkey" PRIMARY KEY ("partnerId")
);

-- CreateTable
CREATE TABLE "partner_service_areas" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_availability" (
    "partnerId" TEXT NOT NULL,
    "acceptingBookings" BOOLEAN NOT NULL DEFAULT true,
    "weeklyCapacity" INTEGER NOT NULL DEFAULT 5,
    "pausedUntil" TIMESTAMP(3),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_availability_pkey" PRIMARY KEY ("partnerId")
);

-- CreateTable
CREATE TABLE "partner_services" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" "PartnerServiceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT,
    "deliverables" TEXT[],
    "priceInPaise" INTEGER NOT NULL,
    "acceptSlaHours" INTEGER,
    "deliveryDays" INTEGER NOT NULL DEFAULT 7,
    "cancellationPolicy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_bookings" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "beneficiaryUserId" TEXT NOT NULL,
    "status" "ServiceBookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "pricePaise" INTEGER NOT NULL,
    "platformFeeBps" INTEGER NOT NULL,
    "platformFeePaise" INTEGER NOT NULL,
    "partnerAmountPaise" INTEGER NOT NULL,
    "paymentId" TEXT,
    "buyerNote" TEXT,
    "preferredSlots" TEXT,
    "acceptBySla" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "refundWindowEndsAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_milestones" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "ServiceMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "submittedNote" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "disputeNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_payment_allocations" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "platformFeePaise" INTEGER NOT NULL,
    "partnerAmountPaise" INTEGER NOT NULL,
    "refundedPaise" INTEGER NOT NULL DEFAULT 0,
    "status" "ServiceAllocationStatus" NOT NULL DEFAULT 'HELD',
    "releasedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "withdrawalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "hiddenAt" TIMESTAMP(3),
    "hiddenBy" TEXT,
    "hiddenNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_enquiries" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'OPEN',
    "callRequested" BOOLEAN NOT NULL DEFAULT false,
    "callRequestedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userUnreadCount" INTEGER NOT NULL DEFAULT 0,
    "partnerUnreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_enquiry_messages" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "author" "EnquiryAuthor" NOT NULL,
    "body" TEXT NOT NULL,
    "redacted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_enquiry_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_marketplace_profiles_isListed_approvedAt_idx" ON "partner_marketplace_profiles"("isListed", "approvedAt");

-- CreateIndex
CREATE INDEX "partner_service_areas_city_idx" ON "partner_service_areas"("city");

-- CreateIndex
CREATE UNIQUE INDEX "partner_service_areas_partnerId_city_key" ON "partner_service_areas"("partnerId", "city");

-- CreateIndex
CREATE INDEX "partner_services_partnerId_isActive_idx" ON "partner_services"("partnerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "partner_services_partnerId_kind_key" ON "partner_services"("partnerId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "service_bookings_paymentId_key" ON "service_bookings"("paymentId");

-- CreateIndex
CREATE INDEX "service_bookings_partnerId_status_idx" ON "service_bookings"("partnerId", "status");

-- CreateIndex
CREATE INDEX "service_bookings_buyerUserId_status_idx" ON "service_bookings"("buyerUserId", "status");

-- CreateIndex
CREATE INDEX "service_bookings_status_acceptBySla_idx" ON "service_bookings"("status", "acceptBySla");

-- CreateIndex
CREATE INDEX "service_milestones_bookingId_status_idx" ON "service_milestones"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_milestones_bookingId_position_key" ON "service_milestones"("bookingId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "service_payment_allocations_bookingId_key" ON "service_payment_allocations"("bookingId");

-- CreateIndex
CREATE INDEX "service_payment_allocations_partnerId_status_idx" ON "service_payment_allocations"("partnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_reviews_bookingId_key" ON "service_reviews"("bookingId");

-- CreateIndex
CREATE INDEX "service_reviews_partnerId_hiddenAt_idx" ON "service_reviews"("partnerId", "hiddenAt");

-- CreateIndex
CREATE INDEX "partner_enquiries_partnerId_status_idx" ON "partner_enquiries"("partnerId", "status");

-- CreateIndex
CREATE INDEX "partner_enquiries_userId_lastMessageAt_idx" ON "partner_enquiries"("userId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "partner_enquiries_partnerId_userId_key" ON "partner_enquiries"("partnerId", "userId");

-- CreateIndex
CREATE INDEX "partner_enquiry_messages_enquiryId_createdAt_idx" ON "partner_enquiry_messages"("enquiryId", "createdAt");

-- AddForeignKey
ALTER TABLE "partner_marketplace_profiles" ADD CONSTRAINT "partner_marketplace_profiles_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_service_areas" ADD CONSTRAINT "partner_service_areas_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_availability" ADD CONSTRAINT "partner_availability_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_services" ADD CONSTRAINT "partner_services_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "partner_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_milestones" ADD CONSTRAINT "service_milestones_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "service_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_payment_allocations" ADD CONSTRAINT "service_payment_allocations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "service_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_payment_allocations" ADD CONSTRAINT "service_payment_allocations_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_payment_allocations" ADD CONSTRAINT "service_payment_allocations_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "partner_withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "service_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_enquiries" ADD CONSTRAINT "partner_enquiries_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_enquiries" ADD CONSTRAINT "partner_enquiries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_enquiries" ADD CONSTRAINT "partner_enquiries_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "partner_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_enquiry_messages" ADD CONSTRAINT "partner_enquiry_messages_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "partner_enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
