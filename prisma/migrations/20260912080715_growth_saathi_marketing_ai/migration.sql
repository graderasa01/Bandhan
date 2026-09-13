-- CreateEnum
CREATE TYPE "MarketingProvider" AS ENUM ('GOOGLE_ADS', 'GOOGLE_ANALYTICS', 'SEARCH_CONSOLE', 'META_ADS', 'FACEBOOK_PAGE', 'INSTAGRAM', 'VIDEO_PROVIDER');

-- CreateEnum
CREATE TYPE "MarketingConnectionStatus" AS ENUM ('CONNECTED', 'NEEDS_ATTENTION', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "MarketingObjective" AS ENUM ('COMPLETED_PROFILE', 'LIVE_PROFILE', 'VERIFIED_PROFILE', 'PAID_SUBSCRIPTION', 'PARTNER_SIGNUP', 'RETURNING_INACTIVE_USER', 'RISHTA_PROGRESSION');

-- CreateEnum
CREATE TYPE "MarketingGoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'DONE');

-- CreateEnum
CREATE TYPE "MarketingTaskStatus" AS ENUM ('WORKING', 'NEEDS_APPROVAL', 'BLOCKED', 'SCHEDULED_LIVE', 'RESULT_READY', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketingRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketingPlatform" AS ENUM ('GOOGLE_SEARCH', 'META');

-- CreateEnum
CREATE TYPE "MarketingReviewStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CreativeAssetKind" AS ENUM ('COPY', 'IMAGE', 'REEL', 'STORY', 'TEMPLATE', 'LANDING');

-- CreateEnum
CREATE TYPE "MarketingApprovalAction" AS ENUM ('APPROVE_PACKAGE', 'GENERATE_CREATIVES', 'CREATE_PAUSED_CAMPAIGNS', 'ACTIVATE_CAMPAIGNS', 'PUBLISH_REEL', 'PUBLISH_FACEBOOK_POST', 'CHANGE_BUDGET', 'PAUSE_CAMPAIGN', 'PUBLISH_WEBSITE_CONTENT');

-- CreateEnum
CREATE TYPE "MarketingApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'FAILED');

-- CreateTable
CREATE TABLE "marketing_connections" (
    "id" TEXT NOT NULL,
    "provider" "MarketingProvider" NOT NULL,
    "accountRef" TEXT,
    "accountLabel" TEXT,
    "settings" JSONB,
    "scopes" TEXT[],
    "status" "MarketingConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "secretCipherText" TEXT,
    "secretIv" TEXT,
    "secretAuthTag" TEXT,
    "secretKind" TEXT,
    "grantedAt" TIMESTAMP(3),
    "grantedBy" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "marketing_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_goals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "MarketingObjective" NOT NULL,
    "geography" TEXT,
    "audienceSide" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "primaryConversion" TEXT NOT NULL,
    "baseline" JSONB,
    "target" INTEGER,
    "targetNote" TEXT,
    "dailyBudgetPaise" INTEGER,
    "totalBudgetPaise" INTEGER,
    "allowedChannels" TEXT[],
    "constraints" TEXT,
    "stopLossRule" TEXT,
    "status" "MarketingGoalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_tasks" (
    "id" TEXT NOT NULL,
    "goalId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "thread" JSONB,
    "goalInput" JSONB,
    "status" "MarketingTaskStatus" NOT NULL DEFAULT 'WORKING',
    "currentStep" TEXT,
    "blockingReason" TEXT,
    "summary" TEXT,
    "channels" TEXT[],
    "budgetDailyPaise" INTEGER,
    "budgetTotalPaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_runs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "MarketingRunStatus" NOT NULL DEFAULT 'RUNNING',
    "toolsCalled" JSONB,
    "inputsWereAggregate" BOOLEAN NOT NULL DEFAULT true,
    "provider" TEXT,
    "modelId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "evidence" JSONB,
    "decisions" JSONB,
    "guardrailFlags" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "marketing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_drafts" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "goalId" TEXT,
    "runId" TEXT,
    "platform" "MarketingPlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "dailyBudgetPaise" INTEGER,
    "totalBudgetPaise" INTEGER,
    "approvalStatus" "MarketingReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "externalCampaignId" TEXT,
    "externalStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_assets" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "draftId" TEXT,
    "runId" TEXT,
    "kind" "CreativeAssetKind" NOT NULL,
    "variantGroup" TEXT,
    "title" TEXT NOT NULL,
    "brief" JSONB NOT NULL,
    "storageRef" TEXT,
    "providerJobRef" TEXT,
    "reviewStatus" "MarketingReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "platformMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_approvals" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" "MarketingApprovalAction" NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "status" "MarketingApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executionResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_metric_snapshots" (
    "id" TEXT NOT NULL,
    "provider" "MarketingProvider" NOT NULL,
    "accountRef" TEXT NOT NULL,
    "campaignRef" TEXT,
    "creativeRef" TEXT,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "btConversions" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freshness" TEXT NOT NULL DEFAULT 'fresh',

    CONSTRAINT "marketing_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_connections_provider_key" ON "marketing_connections"("provider");

-- CreateIndex
CREATE INDEX "marketing_goals_status_createdAt_idx" ON "marketing_goals"("status", "createdAt");

-- CreateIndex
CREATE INDEX "marketing_tasks_status_createdAt_idx" ON "marketing_tasks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "marketing_runs_taskId_startedAt_idx" ON "marketing_runs"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "campaign_drafts_taskId_idx" ON "campaign_drafts"("taskId");

-- CreateIndex
CREATE INDEX "creative_assets_taskId_idx" ON "creative_assets"("taskId");

-- CreateIndex
CREATE INDEX "marketing_approvals_taskId_status_idx" ON "marketing_approvals"("taskId", "status");

-- CreateIndex
CREATE INDEX "marketing_approvals_status_expiresAt_idx" ON "marketing_approvals"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "marketing_metric_snapshots_provider_fetchedAt_idx" ON "marketing_metric_snapshots"("provider", "fetchedAt");

-- AddForeignKey
ALTER TABLE "marketing_tasks" ADD CONSTRAINT "marketing_tasks_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "marketing_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_runs" ADD CONSTRAINT "marketing_runs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "marketing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "marketing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "marketing_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "marketing_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "marketing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "campaign_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_runId_fkey" FOREIGN KEY ("runId") REFERENCES "marketing_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_approvals" ADD CONSTRAINT "marketing_approvals_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "marketing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
