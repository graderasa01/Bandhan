-- Google retired the Gemini 2.0 line; every call to it now returns
-- "404 … no longer available". Three features had been routed to
-- `gemini-2.0-flash-lite` from /admin/ai-settings, so the failure showed up as
-- a thrown error in the middle of rendering a user's dashboard.
--
-- `aiConfigService.healRoute` corrects these at read time as well, so the app
-- is safe with or without this migration — but a row naming a model that does
-- not exist would still be what /admin/ai-settings displays, and the next
-- admin to save any other feature would be looking at a lie. This makes the
-- stored value match what actually runs.
--
-- Provider is deliberately left alone: replacing the model keeps whatever
-- cost/quality tradeoff the admin chose, where switching provider would not.
UPDATE "ai_feature_configs" SET "modelId" = 'gemini-3.5-flash-lite' WHERE "modelId" = 'gemini-2.0-flash-lite';
UPDATE "ai_feature_configs" SET "modelId" = 'gemini-2.5-flash'      WHERE "modelId" = 'gemini-2.0-flash';
UPDATE "ai_feature_configs" SET "modelId" = 'gemini-2.5-flash'      WHERE "modelId" = 'gemini-1.5-flash';
UPDATE "ai_feature_configs" SET "modelId" = 'gemini-2.5-pro'        WHERE "modelId" = 'gemini-1.5-pro';
