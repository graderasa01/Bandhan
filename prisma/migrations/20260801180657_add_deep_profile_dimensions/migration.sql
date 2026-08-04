-- CreateEnum
CREATE TYPE "DeepDimensionKey" AS ENUM ('FAMILY_ORIENTATION', 'CAREER_FOCUS', 'COMMUNICATION_CLARITY', 'EMOTIONAL_MATURITY', 'PRACTICAL_DECISION_STYLE', 'ADAPTABILITY', 'FINANCIAL_DISCIPLINE', 'TRADITION_MODERN_BALANCE', 'RELATIONSHIP_READINESS', 'CONFLICT_HANDLING', 'LONG_TERM_STABILITY', 'LIFESTYLE_ALIGNMENT', 'PARTNER_SUPPORT_EXPECTATION');

-- CreateTable
CREATE TABLE "profile_dimension_scores" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "dimensionKey" "DeepDimensionKey" NOT NULL,
    "scoreValue" INTEGER,
    "scoreLabel" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "explanationText" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_dimension_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_dimension_scores_profileId_idx" ON "profile_dimension_scores"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_dimension_scores_profileId_dimensionKey_key" ON "profile_dimension_scores"("profileId", "dimensionKey");

-- AddForeignKey
ALTER TABLE "profile_dimension_scores" ADD CONSTRAINT "profile_dimension_scores_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
