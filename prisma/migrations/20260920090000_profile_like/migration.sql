-- D-91b: a private like.
--
-- Deliberately its own table rather than a column on `shortlists`: the two
-- have opposite visibility rules (a shortlist is shown to the person saved, a
-- like is shown to nobody), and a boolean flag on one row is exactly how that
-- distinction gets lost the next time somebody writes a query.

CREATE TABLE "profile_likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_likes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "profile_likes_userId_targetProfileId_key" ON "profile_likes"("userId", "targetProfileId");
CREATE INDEX "profile_likes_userId_createdAt_idx" ON "profile_likes"("userId", "createdAt");

ALTER TABLE "profile_likes" ADD CONSTRAINT "profile_likes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profile_likes" ADD CONSTRAINT "profile_likes_targetProfileId_fkey"
    FOREIGN KEY ("targetProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
