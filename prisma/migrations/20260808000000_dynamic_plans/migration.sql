-- Dynamic plans: PlanCode enum → text, and the capability set moves into the
-- `plans` table.
--
-- Hand-written rather than generated. Prisma's own diff for an enum→text
-- change is DROP COLUMN + ADD COLUMN, which would silently empty every
-- subscription's plan. `USING col::text` keeps the values.

-- 1. Widen every column that referenced the enum.
ALTER TABLE "plans"                       ALTER COLUMN "code"     TYPE TEXT USING "code"::text;
ALTER TABLE "subscriptions"               ALTER COLUMN "planCode" TYPE TEXT USING "planCode"::text;
ALTER TABLE "payments"                    ALTER COLUMN "planCode" TYPE TEXT USING "planCode"::text;
ALTER TABLE "user_entitlement_overrides"  ALTER COLUMN "planCode" TYPE TEXT USING "planCode"::text;

-- 2. The enum type has no remaining users.
DROP TYPE "PlanCode";

-- 3. New catalog columns. Defaults are supplied so the ALTERs don't fail on
--    existing rows; the backfill below replaces them with real values.
ALTER TABLE "plans" ADD COLUMN "name"          TEXT    NOT NULL DEFAULT '';
ALTER TABLE "plans" ADD COLUMN "durationLabel" TEXT    NOT NULL DEFAULT 'per month';
ALTER TABLE "plans" ADD COLUMN "rank"          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plans" ADD COLUMN "isPublic"      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "plans" ADD COLUMN "features"      JSONB;

-- 4. Backfill name/rank/duration for the four built-in plans. `features` is
--    deliberately left NULL: getPlanCatalog() falls back to
--    BUILTIN_PLAN_DEFAULTS for a null, so day one behaviour is byte-identical
--    to the old code ladder and the seed fills it in properly.
UPDATE "plans" SET "name" = 'Free',     "rank" = 0, "durationLabel" = 'hamesha'   WHERE "code" = 'FREE';
UPDATE "plans" SET "name" = 'Basic',    "rank" = 1, "durationLabel" = 'per month' WHERE "code" = 'BASIC';
UPDATE "plans" SET "name" = 'Standard', "rank" = 2, "durationLabel" = 'per month' WHERE "code" = 'STANDARD';
UPDATE "plans" SET "name" = 'Premium',  "rank" = 3, "durationLabel" = 'per month' WHERE "code" = 'PREMIUM';

-- Any row this migration doesn't know about (there should be none) at least
-- gets a readable name rather than an empty string.
UPDATE "plans" SET "name" = INITCAP(LOWER("code")) WHERE "name" = '';

-- 5. Carry a previously-set reelPerDay override into `features` so the one
--    admin-editable capability survives the move. The column stays for now.
UPDATE "plans"
   SET "features" = jsonb_build_object('reelPerDay', "reelPerDay")
 WHERE "reelPerDay" IS NOT NULL;

ALTER TABLE "plans" ALTER COLUMN "name" DROP DEFAULT;
