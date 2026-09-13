-- CreateEnum
CREATE TYPE "CampaignDeploymentPhase" AS ENUM ('CREATE', 'ACTIVATE');

-- CreateEnum
CREATE TYPE "CampaignDeploymentStatus" AS ENUM ('CREATE_PENDING', 'QUEUED', 'PREFLIGHT', 'VALIDATING', 'CREATING', 'UNKNOWN_OUTCOME', 'RECONCILING', 'PARTIAL', 'PAUSED_READY', 'ACTIVATION_PENDING', 'ACTIVATION_QUEUED', 'ACTIVATING', 'LIVE', 'BLOCKED_CONFIG', 'BLOCKED_CREATIVE', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED');

-- CreateTable
CREATE TABLE "campaign_deployments" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "platform" "MarketingPlatform" NOT NULL,
    "phase" "CampaignDeploymentPhase" NOT NULL DEFAULT 'CREATE',
    "status" "CampaignDeploymentStatus" NOT NULL DEFAULT 'CREATE_PENDING',
    "accountRef" TEXT,
    "accountLabel" TEXT,
    "currency" TEXT,
    "specHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "executionMarker" TEXT NOT NULL,
    "createApprovalId" TEXT,
    "activateApprovalId" TEXT,
    "externalRefs" JSONB,
    "checkpoint" TEXT,
    "externalStatus" TEXT,
    "providerRequestId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "lastErrorFix" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "lastWriteAttemptAt" TIMESTAMP(3),
    "pausedVerifiedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_execution_events" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "requestId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_execution_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_deployments_idempotencyKey_key" ON "campaign_deployments"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_deployments_executionMarker_key" ON "campaign_deployments"("executionMarker");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_deployments_createApprovalId_key" ON "campaign_deployments"("createApprovalId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_deployments_activateApprovalId_key" ON "campaign_deployments"("activateApprovalId");

-- CreateIndex
CREATE INDEX "campaign_deployments_status_updatedAt_idx" ON "campaign_deployments"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "campaign_deployments_taskId_idx" ON "campaign_deployments"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_deployments_draftId_platform_key" ON "campaign_deployments"("draftId", "platform");

-- CreateIndex
CREATE INDEX "marketing_execution_events_deploymentId_at_idx" ON "marketing_execution_events"("deploymentId", "at");

-- AddForeignKey
ALTER TABLE "campaign_deployments" ADD CONSTRAINT "campaign_deployments_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "campaign_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_deployments" ADD CONSTRAINT "campaign_deployments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "marketing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_deployments" ADD CONSTRAINT "campaign_deployments_createApprovalId_fkey" FOREIGN KEY ("createApprovalId") REFERENCES "marketing_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_deployments" ADD CONSTRAINT "campaign_deployments_activateApprovalId_fkey" FOREIGN KEY ("activateApprovalId") REFERENCES "marketing_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_execution_events" ADD CONSTRAINT "marketing_execution_events_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "campaign_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
