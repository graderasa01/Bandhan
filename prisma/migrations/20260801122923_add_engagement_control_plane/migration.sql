-- CreateEnum
CREATE TYPE "FeatureRollout" AS ENUM ('OFF', 'ALLOWLIST', 'PLAN_GATED', 'ALL');

-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('REEL_UNLOCK', 'AI_ASK', 'VOICE_UNLOCK', 'BOOST');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('VOICE_NOTE', 'PHOTO_BLUR_DERIVATIVE');

-- CreateEnum
CREATE TYPE "MediaModeration" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VoiceNoteContext" AS ENUM ('REEL_INTEREST', 'QUESTION_ANSWER', 'POLL_ICEBREAKER', 'PARENT_BLESSING', 'MATCH_CHAT');

-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('VOICE_NOTE_RECEIVED', 'QUESTION_ASKED', 'QUESTION_ANSWERED', 'QUEST_AVAILABLE', 'REWARD_EARNED', 'FAMILY_ACTION', 'MATCH_CREATED', 'CHAT_NUDGE');

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "rollout" "FeatureRollout" NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_entitlement_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planCode" "PlanCode",
    "capabilityKey" TEXT,
    "value" TEXT,
    "reason" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "RewardKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "celebration_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "celebration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationMs" INTEGER,
    "sizeBytes" INTEGER NOT NULL,
    "transcript" TEXT,
    "moderation" "MediaModeration" NOT NULL DEFAULT 'PENDING',
    "moderationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_notes" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT,
    "context" "VoiceNoteContext" NOT NULL,
    "relatedQuestionId" TEXT,
    "unlockedAt" TIMESTAMP(3),
    "playedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "actorMasked" BOOLEAN NOT NULL DEFAULT false,
    "relatedId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "user_entitlement_overrides_userId_revokedAt_idx" ON "user_entitlement_overrides"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "reward_grants_userId_kind_expiresAt_idx" ON "reward_grants"("userId", "kind", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "celebration_logs_userId_eventKey_key" ON "celebration_logs"("userId", "eventKey");

-- CreateIndex
CREATE INDEX "media_assets_ownerUserId_idx" ON "media_assets"("ownerUserId");

-- CreateIndex
CREATE INDEX "media_assets_moderation_idx" ON "media_assets"("moderation");

-- CreateIndex
CREATE UNIQUE INDEX "voice_notes_mediaAssetId_key" ON "voice_notes"("mediaAssetId");

-- CreateIndex
CREATE INDEX "voice_notes_toUserId_unlockedAt_idx" ON "voice_notes"("toUserId", "unlockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "voice_notes_fromUserId_toUserId_context_key" ON "voice_notes"("fromUserId", "toUserId", "context");

-- CreateIndex
CREATE INDEX "notices_userId_createdAt_idx" ON "notices"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notices_userId_readAt_idx" ON "notices"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "user_entitlement_overrides" ADD CONSTRAINT "user_entitlement_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celebration_logs" ADD CONSTRAINT "celebration_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
