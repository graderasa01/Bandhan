-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'PARTNER', 'ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INCOMPLETE', 'SUSPENDED', 'BLOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('DRAFT', 'INCOMPLETE', 'READY_FOR_REVIEW', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SwipeDirection" AS ENUM ('LEFT', 'RIGHT', 'UP', 'DOWN');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "mobileVerifiedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileStatus" "ProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "displayName" TEXT,
    "gender" TEXT,
    "dateOfBirth" DATE,
    "maritalStatus" TEXT,
    "heightCm" INTEGER,
    "currentCity" TEXT,
    "currentState" TEXT,
    "currentCountry" TEXT DEFAULT 'India',
    "nativePlace" TEXT,
    "bioText" TEXT,
    "profileCompletionScore" INTEGER NOT NULL DEFAULT 0,
    "trustScore" INTEGER,
    "trustScoreLabel" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_basic_details" (
    "profileId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "motherTongue" TEXT,
    "religion" TEXT,
    "community" TEXT,
    "caste" TEXT,
    "gotra" TEXT,
    "manglikStatus" TEXT,
    "birthTime" TEXT,
    "birthPlace" TEXT,

    CONSTRAINT "profile_basic_details_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "profile_education" (
    "profileId" TEXT NOT NULL,
    "highestEducation" TEXT,
    "degreeName" TEXT,
    "collegeName" TEXT,

    CONSTRAINT "profile_education_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "profile_profession" (
    "profileId" TEXT NOT NULL,
    "professionCategory" TEXT,
    "jobTitle" TEXT,
    "companyName" TEXT,
    "annualIncomeRange" TEXT,
    "workCity" TEXT,

    CONSTRAINT "profile_profession_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "profile_family" (
    "profileId" TEXT NOT NULL,
    "familyType" TEXT,
    "familyBackgroundSummary" TEXT,
    "fatherOccupation" TEXT,
    "motherOccupation" TEXT,
    "siblingsCount" TEXT,
    "siblingsMarriedStatus" TEXT,
    "familyValues" TEXT,

    CONSTRAINT "profile_family_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "profile_lifestyle" (
    "profileId" TEXT NOT NULL,
    "diet" TEXT,
    "smoking" TEXT,
    "drinking" TEXT,
    "hobbies" TEXT[],
    "languagesKnown" TEXT[],
    "relocateWilling" TEXT,

    CONSTRAINT "profile_lifestyle_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "profile_partner_preferences" (
    "profileId" TEXT NOT NULL,
    "lookingForGender" TEXT,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "preferredCities" TEXT[],
    "educationPreference" TEXT,
    "incomePreference" TEXT,
    "maritalStatusPreference" TEXT,
    "manglikPreference" TEXT,
    "partnerWorkExpectation" TEXT,
    "dealBreakers" TEXT[],

    CONSTRAINT "profile_partner_preferences_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "profile_photos" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "profile_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_embeddings" (
    "profileId" TEXT NOT NULL,
    "embedding" vector(1024),
    "modelVersion" TEXT,
    "computedAt" TIMESTAMP(3),

    CONSTRAINT "profile_embeddings_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "swipe_actions" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetProfileId" TEXT NOT NULL,
    "dailyReelId" TEXT,
    "direction" "SwipeDirection" NOT NULL,
    "decisionMs" INTEGER,
    "wasButton" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reelDate" DATE NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 5,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "daily_reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reel_profiles" (
    "id" TEXT NOT NULL,
    "dailyReelId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "preferenceScore" DOUBLE PRECISION NOT NULL,
    "trustScoreFactor" DOUBLE PRECISION NOT NULL,
    "recentActivityScore" DOUBLE PRECISION NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "aiReasonText" TEXT,
    "aiConcernText" TEXT,
    "explainedAt" TIMESTAMP(3),

    CONSTRAINT "daily_reel_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interests" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "InterestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetProfileId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "wasBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_key" ON "users"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_sessionTokenHash_key" ON "auth_sessions"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE INDEX "profiles_profileStatus_idx" ON "profiles"("profileStatus");

-- CreateIndex
CREATE INDEX "profiles_isVisible_idx" ON "profiles"("isVisible");

-- CreateIndex
CREATE INDEX "profile_photos_profileId_idx" ON "profile_photos"("profileId");

-- CreateIndex
CREATE INDEX "swipe_actions_actorUserId_idx" ON "swipe_actions"("actorUserId");

-- CreateIndex
CREATE INDEX "swipe_actions_targetProfileId_idx" ON "swipe_actions"("targetProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reels_userId_reelDate_key" ON "daily_reels"("userId", "reelDate");

-- CreateIndex
CREATE INDEX "daily_reel_profiles_profileId_idx" ON "daily_reel_profiles"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reel_profiles_dailyReelId_profileId_key" ON "daily_reel_profiles"("dailyReelId", "profileId");

-- CreateIndex
CREATE INDEX "interests_toUserId_idx" ON "interests"("toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "interests_fromUserId_toUserId_key" ON "interests"("fromUserId", "toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "matches_userAId_userBId_key" ON "matches"("userAId", "userBId");

-- CreateIndex
CREATE UNIQUE INDEX "shortlists_userId_targetProfileId_key" ON "shortlists"("userId", "targetProfileId");

-- CreateIndex
CREATE INDEX "ai_interactions_userId_idx" ON "ai_interactions"("userId");

-- CreateIndex
CREATE INDEX "ai_interactions_feature_idx" ON "ai_interactions"("feature");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_basic_details" ADD CONSTRAINT "profile_basic_details_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_education" ADD CONSTRAINT "profile_education_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_profession" ADD CONSTRAINT "profile_profession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_family" ADD CONSTRAINT "profile_family_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_lifestyle" ADD CONSTRAINT "profile_lifestyle_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_partner_preferences" ADD CONSTRAINT "profile_partner_preferences_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_embeddings" ADD CONSTRAINT "profile_embeddings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_actions" ADD CONSTRAINT "swipe_actions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_actions" ADD CONSTRAINT "swipe_actions_targetProfileId_fkey" FOREIGN KEY ("targetProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_actions" ADD CONSTRAINT "swipe_actions_dailyReelId_fkey" FOREIGN KEY ("dailyReelId") REFERENCES "daily_reels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reels" ADD CONSTRAINT "daily_reels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reel_profiles" ADD CONSTRAINT "daily_reel_profiles_dailyReelId_fkey" FOREIGN KEY ("dailyReelId") REFERENCES "daily_reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reel_profiles" ADD CONSTRAINT "daily_reel_profiles_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interests" ADD CONSTRAINT "interests_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interests" ADD CONSTRAINT "interests_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_targetProfileId_fkey" FOREIGN KEY ("targetProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
