-- CreateEnum
CREATE TYPE "ChatUnlockSource" AS ENUM ('PAYMENT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ChatUnlockCreditReason" AS ENUM ('NO_REPLY', 'PARTNER_WELCOME', 'ALREADY_OPEN', 'ADMIN');

-- AlterEnum
ALTER TYPE "ServiceItemKind" ADD VALUE 'CHAT_UNLOCK';

-- CreateTable
CREATE TABLE "chat_unlocks" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "unlockedByUserId" TEXT NOT NULL,
    "source" "ChatUnlockSource" NOT NULL,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guaranteeSettledAt" TIMESTAMP(3),

    CONSTRAINT "chat_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_unlock_credits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "ChatUnlockCreditReason" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "consumedUnlockId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_unlock_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_unlocks_matchId_key" ON "chat_unlocks"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_unlocks_paymentId_key" ON "chat_unlocks"("paymentId");

-- CreateIndex
CREATE INDEX "chat_unlocks_unlockedByUserId_createdAt_idx" ON "chat_unlocks"("unlockedByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "chat_unlock_credits_consumedUnlockId_key" ON "chat_unlock_credits"("consumedUnlockId");

-- CreateIndex
CREATE INDEX "chat_unlock_credits_userId_consumedAt_idx" ON "chat_unlock_credits"("userId", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "chat_unlock_credits_userId_reason_sourceRef_key" ON "chat_unlock_credits"("userId", "reason", "sourceRef");

-- AddForeignKey
ALTER TABLE "chat_unlocks" ADD CONSTRAINT "chat_unlocks_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_unlocks" ADD CONSTRAINT "chat_unlocks_unlockedByUserId_fkey" FOREIGN KEY ("unlockedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_unlock_credits" ADD CONSTRAINT "chat_unlock_credits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_unlock_credits" ADD CONSTRAINT "chat_unlock_credits_consumedUnlockId_fkey" FOREIGN KEY ("consumedUnlockId") REFERENCES "chat_unlocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
