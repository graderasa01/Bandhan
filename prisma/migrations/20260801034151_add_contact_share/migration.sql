-- CreateTable
CREATE TABLE "contact_shares" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_shares_matchId_idx" ON "contact_shares"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_shares_matchId_userId_key" ON "contact_shares"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "contact_shares" ADD CONSTRAINT "contact_shares_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_shares" ADD CONSTRAINT "contact_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
