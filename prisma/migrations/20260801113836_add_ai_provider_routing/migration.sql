-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('ANTHROPIC', 'OPENAI', 'GEMINI', 'DEEPSEEK');

-- AlterTable
ALTER TABLE "ai_interactions" ADD COLUMN     "provider" "AiProvider" NOT NULL DEFAULT 'ANTHROPIC';

-- CreateTable
CREATE TABLE "ai_feature_configs" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "modelId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ai_feature_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_feature_configs_feature_key" ON "ai_feature_configs"("feature");
