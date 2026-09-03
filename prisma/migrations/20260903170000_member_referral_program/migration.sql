-- CreateEnum
CREATE TYPE "MemberReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'DISQUALIFIED');

-- CreateTable
CREATE TABLE "member_referral_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_referrals" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "codeUsed" TEXT NOT NULL,
    "attributionMethod" "AttributionMethod" NOT NULL DEFAULT 'LINK',
    "status" "MemberReferralStatus" NOT NULL DEFAULT 'PENDING',
    "signupIpHash" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),
    "disqualifiedReason" TEXT,

    CONSTRAINT "member_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_referral_rewards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rung" INTEGER NOT NULL,
    "referralsAtGrant" INTEGER NOT NULL DEFAULT 0,
    "planCode" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "overrideId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_referral_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rewardPlanCode" TEXT NOT NULL DEFAULT 'STANDARD',
    "rewardDays" INTEGER NOT NULL DEFAULT 30,
    "referralsPerReward" INTEGER NOT NULL DEFAULT 3,
    "maxRewardsPerUser" INTEGER NOT NULL DEFAULT 4,
    "requireJoinerPhoto" BOOLEAN NOT NULL DEFAULT true,
    "joinerMinCompletionPercent" INTEGER NOT NULL DEFAULT 60,
    "requireJoinerVerifiedContact" BOOLEAN NOT NULL DEFAULT true,
    "requireReferrerProfileComplete" BOOLEAN NOT NULL DEFAULT true,
    "requireReferrerPhoto" BOOLEAN NOT NULL DEFAULT true,
    "oneQualifiedPerDevice" BOOLEAN NOT NULL DEFAULT true,
    "joinerRewardPlanCode" TEXT NOT NULL DEFAULT 'STANDARD',
    "joinerRewardDays" INTEGER NOT NULL DEFAULT 0,
    "shareMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "member_referral_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_referral_codes_userId_key" ON "member_referral_codes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_referral_codes_code_key" ON "member_referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "member_referrals_referredUserId_key" ON "member_referrals"("referredUserId");

-- CreateIndex
CREATE INDEX "member_referrals_referrerUserId_status_idx" ON "member_referrals"("referrerUserId", "status");

-- CreateIndex
CREATE INDEX "member_referral_rewards_userId_grantedAt_idx" ON "member_referral_rewards"("userId", "grantedAt");

-- CreateIndex
CREATE UNIQUE INDEX "member_referral_rewards_userId_rung_key" ON "member_referral_rewards"("userId", "rung");

-- AddForeignKey
ALTER TABLE "member_referral_codes" ADD CONSTRAINT "member_referral_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_referrals" ADD CONSTRAINT "member_referrals_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_referrals" ADD CONSTRAINT "member_referrals_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
