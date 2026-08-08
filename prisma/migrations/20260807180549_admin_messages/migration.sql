-- CreateEnum
CREATE TYPE "AdminMessageAudience" AS ENUM ('USER', 'PARTNER');

-- CreateEnum
CREATE TYPE "AdminMessageTarget" AS ENUM ('SINGLE', 'SEGMENT', 'ALL');

-- CreateEnum
CREATE TYPE "AdminMessageChannel" AS ENUM ('APP', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "AdminMessageStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AdminMessageDeliveryStatus" AS ENUM ('SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "admin_messages" (
    "id" TEXT NOT NULL,
    "audience" "AdminMessageAudience" NOT NULL,
    "target" "AdminMessageTarget" NOT NULL,
    "targetUserId" TEXT,
    "segmentKey" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "channels" "AdminMessageChannel"[],
    "offerGrant" JSONB,
    "status" "AdminMessageStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "admin_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_message_deliveries" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "AdminMessageChannel" NOT NULL,
    "status" "AdminMessageDeliveryStatus" NOT NULL,
    "providerRef" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_message_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_messages_createdAt_idx" ON "admin_messages"("createdAt");

-- CreateIndex
CREATE INDEX "admin_message_deliveries_userId_idx" ON "admin_message_deliveries"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_message_deliveries_messageId_userId_channel_key" ON "admin_message_deliveries"("messageId", "userId", "channel");

-- AddForeignKey
ALTER TABLE "admin_message_deliveries" ADD CONSTRAINT "admin_message_deliveries_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "admin_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
