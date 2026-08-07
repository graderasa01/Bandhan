-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "incognitoEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
-- Existing swipes default to false: they were made under the old promise, when
-- every visit was attributable. Backfilling them to true would hide browsing
-- the viewer's target had already been shown.
ALTER TABLE "swipe_actions" ADD COLUMN "incognito" BOOLEAN NOT NULL DEFAULT false;
