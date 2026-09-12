-- A preference score that was never computed is null, not 100.
ALTER TABLE "daily_reel_profiles" ALTER COLUMN "preferenceScore" DROP NOT NULL;

-- Fingerprint of the facts the AI explanation was grounded on, so a stale
-- explanation can be detected instead of shown as current.
ALTER TABLE "daily_reel_profiles" ADD COLUMN "aiFactsHash" TEXT;
