-- D-91b, second half: a like is private, and the liker may choose to lift that.
--
-- `revealedAt` null (the default, and every existing row) means the target may
-- be told the *number* and never the name. Set means this one liker decided to
-- be named to this one person.
--
-- The index on targetProfileId is what makes "aapko kitne likes aaye" a single
-- indexed count on the owner's own screen.

ALTER TABLE "profile_likes" ADD COLUMN "revealedAt" TIMESTAMP(3);

CREATE INDEX "profile_likes_targetProfileId_idx" ON "profile_likes"("targetProfileId");
