-- Pricing v2 (D-90, 2026-09-15): the core becomes free, money moves to moments.
--
-- Hand-written. Schema and data travel together on purpose: the new FREE
-- baseline only takes effect where the `plans` row says so (a stored
-- `features` blob wins over the code defaults), and `prisma migrate deploy`
-- is the one step every environment already runs on boot. A separate script
-- would be a second thing to remember, and forgetting it would ship the new
-- screens over the old FREE.

-- 1. The owner's photo choice ------------------------------------------------

CREATE TYPE "PhotoPrivacy" AS ENUM ('MEMBERS', 'MATCH_ONLY');

ALTER TABLE "profiles" ADD COLUMN "photoPrivacy" "PhotoPrivacy" NOT NULL DEFAULT 'MEMBERS';

-- 2. FREE: the new baseline --------------------------------------------------
--    Every PlanFeatureSet key is written, so the row says exactly what
--    BUILTIN_PLAN_DEFAULTS.FREE says. Merged with `||` so a key this migration
--    does not know about survives.

UPDATE "plans"
   SET "features" = COALESCE("features", '{}'::jsonb) || '{
         "reelPerDay": 15, "interestsPerMonth": 60, "chat": false, "aiAskPerDay": 10, "grioChatPerDay": 10,
         "familySeats": 6, "deepDimensions": 13, "boost": false, "readReceipts": true,
         "priorityVerification": false, "assistedMatchmaker": false, "admirerIdentity": true,
         "viewerIdentity": false, "voiceUnlock": true, "photoEnhance": true, "photoUltraEnhance": false,
         "kundliManualEntry": true, "kundliPdfExport": true, "photoUnlockAll": false, "matchExplain": true,
         "grioMemoryFacts": 20, "grioVoice": false, "incognitoBrowse": false, "advancedDiscovery": true
       }'::jsonb,
       "updatedAt" = NOW(),
       "updatedBy" = 'migration:pricing_v2'
 WHERE "code" = 'FREE';

-- 3. The retired tiers -------------------------------------------------------
--    Not deleted: subscriptions and payments reference them by value, and a
--    member inside a paid month keeps resolving to what they bought. Inactive
--    stops `quoteCheckout` selling them; private takes them off every screen.

UPDATE "plans"
   SET "isActive" = false,
       "isPublic" = false,
       "updatedAt" = NOW(),
       "updatedBy" = 'migration:pricing_v2'
 WHERE "code" IN ('BASIC', 'STANDARD', 'PREMIUM');

-- 4. Rishta Pass -------------------------------------------------------------
--    Top rank, so an admin grant of PASS wins `higherOf()` and `nextPlanUp()`
--    from any code resolves to it. Price is editable from /admin/pricing.

INSERT INTO "plans" (
  "id", "code", "name", "priceInPaise", "isActive", "isPublic", "displayOrder", "rank",
  "durationLabel", "features", "updatedAt", "updatedBy"
)
SELECT
  gen_random_uuid()::text, 'PASS', 'Rishta Pass', 49900, true, true, 1,
  COALESCE((SELECT MAX("rank") FROM "plans"), 0) + 1,
  'per month',
  '{
     "reelPerDay": 15, "interestsPerMonth": 60, "chat": true, "aiAskPerDay": 40, "grioChatPerDay": 60,
     "familySeats": 6, "deepDimensions": 13, "boost": false, "readReceipts": true,
     "priorityVerification": false, "assistedMatchmaker": false, "admirerIdentity": true,
     "viewerIdentity": true, "voiceUnlock": true, "photoEnhance": true, "photoUltraEnhance": true,
     "kundliManualEntry": true, "kundliPdfExport": true, "photoUnlockAll": false, "matchExplain": true,
     "grioMemoryFacts": 40, "grioVoice": true, "incognitoBrowse": true, "advancedDiscovery": true
   }'::jsonb,
  NOW(),
  'migration:pricing_v2'
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "code" = 'PASS');

-- 5. Discovery Week sold a capability FREE now has -----------------------------
--    The built-in item is deactivated in code too; this covers an admin row.

UPDATE "service_items" SET "isActive" = false, "updatedAt" = NOW() WHERE "code" = 'DISCOVERY_WEEK';

-- 6. Tell every member with a photo what changed, once ------------------------

INSERT INTO "notices" ("id", "userId", "kind", "title", "body", "href", "actorMasked", "relatedId", "createdAt")
SELECT
  gen_random_uuid()::text,
  p."userId",
  'ANNOUNCEMENT',
  'Photo ka naya niyam',
  'Ab jin members ki profile live hai aur jinki apni photo lagi hai, wo aapki photo dekh sakte hain. Chahein to Profile Access me apni photo sirf match par rakh sakte hain.',
  '/user/profile/access',
  false,
  'pricing-v2-photo',
  NOW()
FROM "profiles" p
WHERE p."deletedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "profile_photos" ph WHERE ph."profileId" = p."id" AND ph."deletedAt" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "notices" n WHERE n."userId" = p."userId" AND n."relatedId" = 'pricing-v2-photo'
  );
