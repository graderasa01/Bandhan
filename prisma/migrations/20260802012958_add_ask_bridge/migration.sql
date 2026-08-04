-- CreateEnum
CREATE TYPE "ProfileQuestionStatus" AS ENUM ('PENDING', 'ANSWERED', 'DECLINED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'QUESTION';

-- CreateTable
CREATE TABLE "profile_questions" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "politeText" TEXT,
    "moderation" "MediaModeration" NOT NULL DEFAULT 'PENDING',
    "moderationReason" TEXT,
    "status" "ProfileQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "answerVoiceNoteId" TEXT,
    "answeredAt" TIMESTAMP(3),
    "askerRevealedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_questions_toUserId_status_idx" ON "profile_questions"("toUserId", "status");

-- CreateIndex
CREATE INDEX "profile_questions_moderation_idx" ON "profile_questions"("moderation");

-- CreateIndex
CREATE UNIQUE INDEX "profile_questions_fromUserId_toUserId_key" ON "profile_questions"("fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "profile_questions" ADD CONSTRAINT "profile_questions_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_questions" ADD CONSTRAINT "profile_questions_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
