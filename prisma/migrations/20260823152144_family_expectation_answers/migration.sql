-- CreateTable
CREATE TABLE "family_expectation_answers" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "answerJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_expectation_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_expectation_answers_ownerUserId_idx" ON "family_expectation_answers"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "family_expectation_answers_familyMemberId_questionKey_key" ON "family_expectation_answers"("familyMemberId", "questionKey");

-- AddForeignKey
ALTER TABLE "family_expectation_answers" ADD CONSTRAINT "family_expectation_answers_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_expectation_answers" ADD CONSTRAINT "family_expectation_answers_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
