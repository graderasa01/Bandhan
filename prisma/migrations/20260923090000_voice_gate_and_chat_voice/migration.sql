-- Voice gate + chat voice messages (2026-09-23).
--
-- 1. Chat voice messages: a Message may carry one voice clip. Unique, so one
--    recording can never be two messages; SET NULL so an admin removing the
--    audio leaves the conversation's shape intact.

ALTER TABLE "messages" ADD COLUMN "mediaAssetId" TEXT;
CREATE UNIQUE INDEX "messages_mediaAssetId_key" ON "messages"("mediaAssetId");
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. FREE: hearing a stranger's voice note now needs the ₹99 moment (an open
--    chat with the sender) or Rishta Pass; talking to Grio out loud opens to
--    every plan, bounded by the existing `grioChatPerDay` turns. Merged with
--    `||` like the D-90 baseline, so an admin's other overrides survive.

UPDATE "plans"
   SET "features" = COALESCE("features", '{}'::jsonb) || '{"voiceUnlock": false, "grioVoice": true}'::jsonb,
       "updatedAt" = NOW(),
       "updatedBy" = 'migration:voice_gate'
 WHERE "code" = 'FREE';
