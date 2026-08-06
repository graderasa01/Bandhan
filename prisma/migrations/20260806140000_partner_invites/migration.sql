-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'OPENED', 'JOINED');

-- CreateTable
CREATE TABLE "partner_invites" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "token" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "OutreachChannel",
    "consentAttestedAt" TIMESTAMP(3) NOT NULL,
    "sendProvider" TEXT,
    "sendRef" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "convertedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_invites_token_key" ON "partner_invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX "partner_invites_convertedUserId_key" ON "partner_invites"("convertedUserId");

-- CreateIndex
CREATE INDEX "partner_invites_partnerId_createdAt_idx" ON "partner_invites"("partnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_convertedUserId_fkey" FOREIGN KEY ("convertedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
