-- Advanced Discovery search, redesigned (2026-09-12).
--
-- Two things land here:
--
--   1. `profile_discovery_consent` — per-field opt-in that lets a sensitive
--      fact (religion, caste/community, gotra, manglik, income) be *filtered*
--      on. Every column defaults to false and no rows are backfilled, so every
--      existing profile stays un-searchable by those filters until its owner
--      flips a switch. A filter on a non-consented profile simply does not
--      match — the row is absent from the result set, which is exactly what a
--      profile that never filled the field looks like, so result membership
--      leaks nothing.
--
--   2. Indexes for the search's `where` and its keyset cursor. The search is
--      "exact filters, newest first, paged by (createdAt, id)", not the ranked
--      reel, so it wants plain b-trees on the columns it compares, not a
--      vector index:
--
--        - profiles(isVisible, profileStatus, gender, createdAt DESC, id DESC):
--          the three equality predicates every search starts with, in the
--          order they are compared, followed by the sort key — one index
--          serves both the base scan and the cursor "rows after this one"
--          without a separate sort step.
--        - profiles(dateOfBirth / currentCity / currentState / currentCountry /
--          trustScore / maritalStatus / heightCm): the remaining scalar
--          filters. Each is its own index rather than one wide composite
--          because a search uses an unpredictable subset of them; the planner
--          picks the most selective one per query and bitmap-ANDs the rest.
--        - one index per filterable column on the one-to-one sub-tables
--          (education, profession, lifestyle, family, basic details). Those
--          tables are joined on their primary key (profileId), so the filter
--          side needs its own index to avoid a scan of the sub-table.
--        - `annualIncomeRange`, `religion`, `caste`, `community`,
--          `manglikStatus` are indexed too even though they are consent-gated:
--          the consent join keeps non-consenting rows out of the result, but
--          the value predicate still has to be cheap for the rows that are in.
--
-- Name search is the one non-equality filter: `displayName ILIKE '%neha%'`.
-- A b-tree cannot serve a leading-wildcard match, so it gets a trigram GIN
-- index (pg_trgm, enabled above) on lower(displayName) — that is the
-- Postgres-native way to make a case-insensitive substring search index-
-- assisted instead of a sequential scan of every visible profile. The
-- expression index cannot be declared in schema.prisma, so it lives here as
-- raw SQL; Prisma's migrate diff does not model expression indexes and will
-- neither recreate nor drop it.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateTable
CREATE TABLE "profile_discovery_consent" (
    "profileId" TEXT NOT NULL,
    "religionSearchable" BOOLEAN NOT NULL DEFAULT false,
    "casteSearchable" BOOLEAN NOT NULL DEFAULT false,
    "gotraSearchable" BOOLEAN NOT NULL DEFAULT false,
    "manglikSearchable" BOOLEAN NOT NULL DEFAULT false,
    "incomeSearchable" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_discovery_consent_pkey" PRIMARY KEY ("profileId")
);

-- CreateIndex
CREATE INDEX "profile_basic_details_motherTongue_idx" ON "profile_basic_details"("motherTongue");

-- CreateIndex
CREATE INDEX "profile_basic_details_religion_idx" ON "profile_basic_details"("religion");

-- CreateIndex
CREATE INDEX "profile_basic_details_caste_idx" ON "profile_basic_details"("caste");

-- CreateIndex
CREATE INDEX "profile_basic_details_community_idx" ON "profile_basic_details"("community");

-- CreateIndex
CREATE INDEX "profile_basic_details_manglikStatus_idx" ON "profile_basic_details"("manglikStatus");

-- CreateIndex
CREATE INDEX "profile_education_highestEducation_idx" ON "profile_education"("highestEducation");

-- CreateIndex
CREATE INDEX "profile_family_familyType_idx" ON "profile_family"("familyType");

-- CreateIndex
CREATE INDEX "profile_family_familyValues_idx" ON "profile_family"("familyValues");

-- CreateIndex
CREATE INDEX "profile_lifestyle_diet_idx" ON "profile_lifestyle"("diet");

-- CreateIndex
CREATE INDEX "profile_lifestyle_smoking_idx" ON "profile_lifestyle"("smoking");

-- CreateIndex
CREATE INDEX "profile_lifestyle_drinking_idx" ON "profile_lifestyle"("drinking");

-- CreateIndex
CREATE INDEX "profile_lifestyle_relocateWilling_idx" ON "profile_lifestyle"("relocateWilling");

-- CreateIndex
CREATE INDEX "profile_profession_professionCategory_idx" ON "profile_profession"("professionCategory");

-- CreateIndex
CREATE INDEX "profile_profession_annualIncomeRange_idx" ON "profile_profession"("annualIncomeRange");

-- CreateIndex
CREATE INDEX "profile_profession_workCity_idx" ON "profile_profession"("workCity");

-- CreateIndex
CREATE INDEX "profiles_isVisible_profileStatus_gender_createdAt_id_idx" ON "profiles"("isVisible", "profileStatus", "gender", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "profiles_dateOfBirth_idx" ON "profiles"("dateOfBirth");

-- CreateIndex
CREATE INDEX "profiles_currentCity_idx" ON "profiles"("currentCity");

-- CreateIndex
CREATE INDEX "profiles_currentState_idx" ON "profiles"("currentState");

-- CreateIndex
CREATE INDEX "profiles_currentCountry_idx" ON "profiles"("currentCountry");

-- CreateIndex
CREATE INDEX "profiles_trustScore_idx" ON "profiles"("trustScore");

-- CreateIndex
CREATE INDEX "profiles_maritalStatus_idx" ON "profiles"("maritalStatus");

-- CreateIndex
CREATE INDEX "profiles_heightCm_idx" ON "profiles"("heightCm");

-- AddForeignKey
ALTER TABLE "profile_discovery_consent" ADD CONSTRAINT "profile_discovery_consent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Case-insensitive partial name search (see header). `lower()` matches the
-- `mode: "insensitive"` contains-filter Prisma emits (`ILIKE`), which Postgres
-- rewrites onto this index for patterns of 3+ characters. Trigram operators
-- come from pg_trgm, enabled at the top of this file.
CREATE INDEX IF NOT EXISTS "profiles_displayName_trgm_idx"
  ON "profiles" USING gin (lower("displayName") gin_trgm_ops);
