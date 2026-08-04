-- CreateEnum
CREATE TYPE "QuizBattleStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'DECLINED');

-- CreateTable
CREATE TABLE "quiz_battles" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "status" "QuizBattleStatus" NOT NULL DEFAULT 'PENDING',
    "questionKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "quiz_battles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_battle_answers" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_battle_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quiz_battles_matchId_status_idx" ON "quiz_battles"("matchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_battle_answers_battleId_userId_questionKey_key" ON "quiz_battle_answers"("battleId", "userId", "questionKey");

-- AddForeignKey
ALTER TABLE "quiz_battles" ADD CONSTRAINT "quiz_battles_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_battle_answers" ADD CONSTRAINT "quiz_battle_answers_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "quiz_battles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
