import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isSecretBoxConfigured, lastFourOf, open, seal } from "@/lib/security/secretBox";
import type { Role } from "@prisma/client";

/**
 * Where a third-party API key comes from at call time.
 *
 * Two sources, in this order:
 *
 *   1. **`ProviderCredential` row** — set from /admin/ai-settings, encrypted at
 *      rest. Wins when present.
 *   2. **The env var** — unchanged, still works, still the answer for a
 *      deployment nobody has touched the admin page on.
 *
 * That ordering is what makes this additive: every existing `.env` keeps
 * working exactly as before, and the admin page is a way to *override* a key
 * (or supply one that was never in the env) without a redeploy. On Railway
 * this matters because a key change previously meant editing env vars and
 * waiting out a full rebuild.
 *
 * Deliberately not managed here: `RAZORPAY_KEY_SECRET` (a payment-signing
 * secret should not be rotatable from a web form) and the VAPID pair
 * (regenerating those silently invalidates every existing push subscription —
 * see lib/services/notice/webPush.ts).
 */

export const CREDENTIAL_PROVIDERS = [
  "ANTHROPIC",
  "OPENAI",
  "GEMINI",
  "DEEPSEEK",
  "SARVAM",
  "RESEND",
  "WHATSAPP",
] as const;

export type CredentialProvider = (typeof CREDENTIAL_PROVIDERS)[number];

export function isCredentialProvider(value: string): value is CredentialProvider {
  return (CREDENTIAL_PROVIDERS as readonly string[]).includes(value);
}

/** Display metadata for /admin/ai-settings. `envVar` is the fallback this provider reads when no row exists. */
export const CREDENTIAL_META: Record<
  CredentialProvider,
  { label: string; envVar: string; blurb: string }
> = {
  ANTHROPIC: {
    label: "Anthropic (Claude)",
    envVar: "ANTHROPIC_API_KEY",
    blurb: "Grio, match explain, profile extraction — default provider.",
  },
  OPENAI: {
    label: "OpenAI (GPT)",
    envVar: "OPENAI_API_KEY",
    blurb: "Text features plus AI Ultra Enhance (photo relight).",
  },
  GEMINI: {
    label: "Google Gemini",
    envVar: "GEMINI_API_KEY",
    blurb: "Text features plus AI Ultra Enhance (photo relight).",
  },
  DEEPSEEK: {
    label: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    blurb: "Sasta text provider — koi image support nahi.",
  },
  SARVAM: {
    label: "Sarvam AI (voice)",
    envVar: "SARVAM_API_KEY",
    blurb: "Hindi speech-to-text aur text-to-speech. Na ho to browser voice par fallback ho jaata hai.",
  },
  RESEND: {
    label: "Resend (email)",
    envVar: "RESEND_API_KEY",
    blurb: "Partner outreach aur admin messages ke email.",
  },
  WHATSAPP: {
    label: "WhatsApp Cloud API",
    envVar: "WHATSAPP_ACCESS_TOKEN",
    blurb: "Meta ka access token. Phone number ID aur template naam abhi bhi env se aate hain.",
  },
};

const CACHE_TTL_MS = 30_000;
let cache: { at: number; keys: Partial<Record<CredentialProvider, string>> } | null = null;

async function loadAll(): Promise<Partial<Record<CredentialProvider, string>>> {
  const keys: Partial<Record<CredentialProvider, string>> = {};
  // No key configured means nothing was ever sealed, so there is nothing to
  // open — skip the DB entirely rather than log a decrypt failure per row.
  if (isSecretBoxConfigured()) {
    const rows = await prisma.providerCredential.findMany();
    for (const row of rows) {
      if (!isCredentialProvider(row.provider)) continue;
      const plain = open({ cipherText: row.cipherText, iv: row.iv, authTag: row.authTag });
      if (plain) keys[row.provider] = plain;
      else {
        // Almost always a rotated SECRETS_ENCRYPTION_KEY. Falling through to
        // the env var is the right degradation; an admin re-saves the key to fix it.
        console.error(`[ai:credentials] ${row.provider} ki stored key decrypt nahi hui — env var par fallback.`);
      }
    }
  }
  return keys;
}

/**
 * The key a provider should authenticate with right now, or null when neither
 * source has one. Callers keep their existing `not_configured` behaviour —
 * this never throws.
 */
export async function getProviderKey(provider: CredentialProvider): Promise<string | null> {
  const envValue = process.env[CREDENTIAL_META[provider].envVar] ?? null;

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.keys[provider] ?? envValue;
  }

  try {
    const keys = await loadAll();
    cache = { at: Date.now(), keys };
    return keys[provider] ?? envValue;
  } catch (err) {
    // Same rule as aiConfigService: a DB hiccup must not take every AI call
    // down when a perfectly good env var is sitting right there.
    console.error(
      "[ai:credentials] DB read failed, falling back to env vars:",
      err instanceof Error ? err.message : String(err),
    );
    return envValue;
  }
}

export type CredentialStatusRow = {
  provider: CredentialProvider;
  label: string;
  envVar: string;
  blurb: string;
  /** "DB" = an admin set it here, "ENV" = coming from the environment, "NONE" = not configured at all. */
  source: "DB" | "ENV" | "NONE";
  /** `••••`-style hint of the installed key. Never the key itself. */
  maskedHint: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
};

/**
 * For the admin page. Never returns a key — only which source is winning and
 * the last four characters, which is enough for a human to confirm *which*
 * key is installed without the page becoming a credential leak.
 */
export async function listCredentialStatus(): Promise<CredentialStatusRow[]> {
  const rows = isSecretBoxConfigured() ? await prisma.providerCredential.findMany() : [];
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return CREDENTIAL_PROVIDERS.map((provider) => {
    const meta = CREDENTIAL_META[provider];
    const row = byProvider.get(provider);
    const envValue = process.env[meta.envVar];

    if (row) {
      return {
        provider,
        ...meta,
        source: "DB" as const,
        maskedHint: `••••${row.lastFour}`,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      };
    }
    return {
      provider,
      ...meta,
      source: envValue ? ("ENV" as const) : ("NONE" as const),
      maskedHint: envValue ? `••••${lastFourOf(envValue)}` : null,
      updatedAt: null,
      updatedBy: null,
    };
  });
}

export type CredentialWriteResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

export async function setProviderKey(params: {
  provider: CredentialProvider;
  apiKey: string;
  actorId: string;
  actorRole: Role;
}): Promise<CredentialWriteResult> {
  const { provider, actorId, actorRole } = params;
  const apiKey = params.apiKey.trim();

  if (!apiKey) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Key khaali nahi ho sakti.", status: 422 };
  }
  if (!isSecretBoxConfigured()) {
    return {
      ok: false,
      error: "NOT_CONFIGURED",
      message:
        "SECRETS_ENCRYPTION_KEY set nahi hai — key encrypt kiye bina save nahi kar sakte. Pehle wo env var set karein.",
      status: 503,
    };
  }

  const sealed = seal(apiKey);

  await prisma.$transaction(async (tx) => {
    await tx.providerCredential.upsert({
      where: { provider },
      create: { provider, ...sealed, lastFour: lastFourOf(apiKey), updatedBy: actorId },
      update: { ...sealed, lastFour: lastFourOf(apiKey), updatedBy: actorId },
    });
    // The audit trail records *that* a key changed and its last four — never
    // any part of the key that would let it be reconstructed from the log.
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "PROVIDER_KEY_SET",
        targetType: "provider_credential",
        targetId: provider,
        newValue: `••••${lastFourOf(apiKey)}`,
      },
    });
  });

  cache = null;
  return { ok: true };
}

/** Removes the stored key. The env var, if any, silently takes over again. */
export async function clearProviderKey(params: {
  provider: CredentialProvider;
  actorId: string;
  actorRole: Role;
}): Promise<CredentialWriteResult> {
  const { provider, actorId, actorRole } = params;

  const existing = await prisma.providerCredential.findUnique({ where: { provider } });
  if (!existing) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.providerCredential.delete({ where: { provider } });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "PROVIDER_KEY_CLEARED",
        targetType: "provider_credential",
        targetId: provider,
        previousValue: `••••${existing.lastFour}`,
      },
    });
  });

  cache = null;
  return { ok: true };
}

/** Test seam — forces the next `getProviderKey` to re-read the DB. */
export function invalidateCredentialCache() {
  cache = null;
}
