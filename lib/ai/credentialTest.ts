import "server-only";
import { AI_PROVIDER_MODELS } from "@/lib/ai/models";
import { getProviderKey, type CredentialProvider } from "@/lib/ai/credentials";
import { probeModel } from "@/lib/ai/probe";

/**
 * "Is this key actually good?" — the question a masked `••••a1b2` can't
 * answer.
 *
 * A key can be present, correctly typed, and still rejected: revoked,
 * out of credit, or wrong project. Without this, the first time anyone finds
 * out is a user hitting a broken feature, so the admin page can ask upstream
 * directly.
 *
 * Two rules for every probe here:
 *
 *   • **Cheap.** The AI providers get a 1-token completion on their cheapest
 *     listed model. Fractions of a paisa.
 *   • **It must not send anything to anyone.** Resend and WhatsApp are
 *     verified with read-only GETs against the account, never a test message —
 *     an admin clicking "Test" must never put a real message in a real
 *     person's inbox.
 */

export type CredentialTestResult = {
  ok: boolean;
  /** Short Hinglish line for the admin UI. */
  message: string;
};

export async function testProviderKey(provider: CredentialProvider): Promise<CredentialTestResult> {
  const key = await getProviderKey(provider);
  if (!key) {
    return { ok: false, message: "Koi key set nahi hai — na yahan, na env me." };
  }

  try {
    switch (provider) {
      case "ANTHROPIC":
      case "OPENAI":
      case "GEMINI":
      case "DEEPSEEK":
        return await testAiProvider(provider);
      case "SARVAM":
        return await testSarvam(key);
      case "RESEND":
        return await testResend(key);
      case "WHATSAPP":
        return await testWhatsApp(key);
      case "META_MARKETING":
        return await testMetaMarketing(key);
      case "GOOGLE_ADS_DEVELOPER":
        // Legacy since Google's 2026-09-09 sunset: the header is optional and
        // ignored by the API servers, and access level is the Cloud
        // project's. Nothing to test on its own — the Ads connection test on
        // the Growth Saathi page is the real check either way.
        return {
          ok: true,
          message:
            "Token save hai (legacy — Google ab ise ignore karta hai; access level Cloud project ka hai). Asli check: /admin/marketing-ai par Google Ads connection ka Test.",
        };
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

async function testAiProvider(
  provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "DEEPSEEK",
): Promise<CredentialTestResult> {
  // The catalog is ordered cheapest-first (lib/ai/models.ts), so [0] is the
  // least expensive way to prove the key authenticates. 64 tokens, not 8:
  // reasoning-style models spend budget before emitting any text, and a probe
  // that starves them returns empty content that reads like a broken key.
  //
  // `thinking: "off"` closes that hole properly rather than by out-budgeting
  // it: this call only has to prove the key authenticates, so there is nothing
  // for reasoning to improve, and no budget large enough to be safe if the
  // admin points the provider at a model that thinks harder.
  const model = AI_PROVIDER_MODELS[provider][0].id;

  // Through the probe rather than a bare client call, so the result also lands
  // in the health registry — the model table on the same page then shows what
  // this button just learned instead of "Not checked yet".
  const probe = await probeModel(provider, model);
  if (probe.outcome === "MODEL_SUCCESS") return { ok: true, message: `Key kaam kar rahi hai (${model}).` };

  // The question this button answers is "is the key good", and only a missing
  // or rejected key actually says no. An empty balance is its own answer: the
  // key is fine and a top-up fixes it, which is a different errand from
  // rotating a credential. Everything else — a busy model, an empty completion
  // — happened *after* the key was accepted.
  switch (probe.outcome) {
    case "MODEL_NOT_CONFIGURED":
      return { ok: false, message: "Koi key set nahi hai — na yahan, na env me." };
    case "MODEL_AUTH_FAILED":
      return { ok: false, message: `Provider ne key reject kar di (${probe.httpStatus ?? "?"}).` };
    case "MODEL_QUOTA_EXCEEDED":
      return {
        ok: false,
        message: `Key sahi hai, par account me balance/quota khatam hai (${probe.reason ?? "quota"}) — top-up ya plan check karein.`,
      };
    case "MODEL_RATE_LIMITED":
      return { ok: true, message: "Key sahi hai — abhi rate limit lagi hai, thodi der baad phir dekhein." };
    case "MODEL_UNAVAILABLE":
      return {
        ok: true,
        message: `Key sahi hai — par ${model} abhi available nahi (${probe.httpStatus ?? "?"} ${probe.reason ?? ""}). Neeche model table me doosre models check karein.`,
      };
    default:
      return {
        ok: false,
        message: `Key authenticate ho gayi, par call fail hui (${model}): ${probe.outcome}${probe.detail ? ` — ${probe.detail}` : ""}`,
      };
  }
}

async function testSarvam(key: string): Promise<CredentialTestResult> {
  // Sarvam has no free auth-check endpoint, so this is the smallest real call
  // that exists — one word of speech. Same request shape *and the same
  // speaker* as app/api/speech/tts/route.ts: bulbul:v3 rejects speakers that
  // aren't on its own list with a 400, and a probe that fails validation tells
  // an admin nothing about whether their key is good.
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      text: "ok",
      language_code: "hi-IN",
      speaker: "shreya",
      model: "bulbul:v3",
      speech_sample_rate: 8000,
    }),
  });

  if (res.ok) return { ok: true, message: "Sarvam key kaam kar rahi hai." };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: "Sarvam ne key reject kar di (401/403)." };
  }
  return { ok: false, message: `Sarvam se ${res.status} aaya: ${(await res.text().catch(() => "")).slice(0, 160)}` };
}

async function testResend(key: string): Promise<CredentialTestResult> {
  // Read-only: lists the account's verified sending domains. Nothing is sent.
  const res = await fetch("https://api.resend.com/domains", {
    headers: { authorization: `Bearer ${key}` },
  });

  if (res.ok) {
    const from = process.env.OUTREACH_EMAIL_FROM;
    return {
      ok: true,
      message: from
        ? "Resend key kaam kar rahi hai."
        : "Key sahi hai, par OUTREACH_EMAIL_FROM set nahi hai — email tab bhi nahi jaayega.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: "Resend ne key reject kar di (401/403)." };
  }
  return { ok: false, message: `Resend se ${res.status} aaya.` };
}

async function testWhatsApp(token: string): Promise<CredentialTestResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    return {
      ok: false,
      message: "WHATSAPP_PHONE_NUMBER_ID set nahi hai — token akela kaafi nahi hai.",
    };
  }

  const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";
  // Read-only: fetches the business phone number's own record. Nothing is sent.
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (res.ok) return { ok: true, message: "WhatsApp token kaam kar raha hai." };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: "Meta ne token reject kar diya (401/403) — expire ho gaya hoga." };
  }
  return { ok: false, message: `Meta se ${res.status} aaya.` };
}

async function testMetaMarketing(token: string): Promise<CredentialTestResult> {
  const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
  // Read-only: the token's own identity. Nothing is published, nothing is
  // spent — and `permissions` says whether the read scopes Growth Saathi
  // needs were actually granted, which a 200 on /me alone would not.
  const res = await fetch(`https://graph.facebook.com/${version}/me?fields=id,name`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403 || res.status === 400) {
    return { ok: false, message: "Meta ne token reject kar diya — expire ho gaya hoga ya galat app ka hai." };
  }
  if (!res.ok) return { ok: false, message: `Meta se ${res.status} aaya.` };
  const me = (await res.json()) as { name?: string; id?: string };
  return { ok: true, message: `Token kaam kar raha hai (${me.name ?? me.id ?? "system user"}).` };
}
