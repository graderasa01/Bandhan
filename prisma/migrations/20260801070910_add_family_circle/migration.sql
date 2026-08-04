-- CreateEnum
CREATE TYPE "FamilyRelation" AS ENUM ('PARENT', 'SIBLING', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "FamilyMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "shortlists" ADD COLUMN     "addedByFamilyMemberId" TEXT;

-- CreateTable
CREATE TABLE "family_members" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "relation" "FamilyRelation" NOT NULL,
    "status" "FamilyMemberStatus" NOT NULL DEFAULT 'INVITED',
    "inviteToken" TEXT NOT NULL,
    "inviteExpiresAt" TIMESTAMP(3) NOT NULL,
    "boundAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_sessions" (
    "id" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "family_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_notes" (
    "id" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "targetProfileId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "family_members_inviteToken_key" ON "family_members"("inviteToken");

-- CreateIndex
CREATE INDEX "family_members_ownerUserId_idx" ON "family_members"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "family_members_ownerUserId_displayName_key" ON "family_members"("ownerUserId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "family_sessions_sessionTokenHash_key" ON "family_sessions"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "family_sessions_familyMemberId_idx" ON "family_sessions"("familyMemberId");

-- CreateIndex
CREATE INDEX "family_notes_targetProfileId_idx" ON "family_notes"("targetProfileId");

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_addedByFamilyMemberId_fkey" FOREIGN KEY ("addedByFamilyMemberId") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_sessions" ADD CONSTRAINT "family_sessions_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_notes" ADD CONSTRAINT "family_notes_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_notes" ADD CONSTRAINT "family_notes_targetProfileId_fkey" FOREIGN KEY ("targetProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
