import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getProviderKey } from "@/lib/ai/credentials";
import {
  GEMINI_DEFAULT_VOICE,
  SARVAM_DEFAULT_VOICE,
  VOICE_PROVIDER_META,
  isGeminiVoice,
  isSarvamVoice,
  type VoiceProviderName,
} from "./voiceCatalog";
import type { Role } from "@prisma/client";

/**
 * Which vendor answers Grio's ears and mouth on this deployment right now.
 *
 * The same shape as `aiConfigService` — one row, short in-process cache, admin
 * writes bust it — and for the same reason: a change saved at /admin/ai-settings
 * has to take effect without a redeploy.
 *
 * ## The one behaviour worth reading twice
 *
 * `resolveVoiceRoute` never returns a provider whose key is missing. An admin
 * who selects Gemini before the Gemini key is funded — which is exactly the
 * state this deployment is in as of 2026-08-10 — would otherwise silently break
 * voice for every user: the route would 503, the client would fall back to the
 * browser's flat synthesiser, and nothing on screen would say why. So a
 * keyless choice degrades to the *other* vendor if that one has a key, and only
 * then to null (browser voice).
 *
 * That is deliberately a resolution rule and not a save-time validation. The
 * admin must be able to select Gemini *before* pasting the key — otherwise the
 * settings page can only be filled in one order — and a key can be revoked
 * upstream long after it was saved, which no form-level check would catch.
 */

export type VoiceRouteKind = "stt" | "tts";

export interface VoiceRoute {
  provider: VoiceProviderName;
  /** The vendor's own speaker/voice name, already validated against its catalog. */
  voice: string;
  apiKey: string;
  /** True when this is not what the admin chose — the chosen vendor had no key. */
  fellBack: boolean;
}

export interface VoiceSettingsView {
  sttProvider: VoiceProviderName;
  ttsProvider: VoiceProviderName;
  sarvamVoice: string;
  geminiVoice: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

const DEFAULTS: VoiceSettingsView = {
  sttProvider: "SARVAM",
  ttsProvider: "SARVAM",
  sarvamVoice: SARVAM_DEFAULT_VOICE,
  geminiVoice: GEMINI_DEFAULT_VOICE,
  updatedAt: null,
  updatedBy: null,
};

const SINGLETON_ID = "singleton";
const CACHE_TTL_MS = 30_000;
let cache: { at: number; settings: VoiceSettingsView } | null = null;

export async function getVoiceSettings(): Promise<VoiceSettingsView> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.settings;
  try {
    const row = await prisma.voiceSettings.findUnique({ where: { id: SINGLETON_ID } });
    const settings: VoiceSettingsView = row
      ? {
          sttProvider: row.sttProvider,
          ttsProvider: row.ttsProvider,
          // Validated on read as well as write: the catalog can shrink on
          // deploy, and a retired speaker sitting in the DB would otherwise
          // become a paid call the vendor rejects.
          sarvamVoice: isSarvamVoice(row.sarvamVoice) ? row.sarvamVoice : SARVAM_DEFAULT_VOICE,
          geminiVoice: isGeminiVoice(row.geminiVoice) ? row.geminiVoice : GEMINI_DEFAULT_VOICE,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        }
      : DEFAULTS;
    cache = { at: Date.now(), settings };
    return settings;
  } catch (err) {
    // Same rule as aiConfigService/credentials: a DB hiccup must not take voice
    // down when the code-side default is a perfectly good route.
    console.error(
      "[speech:config] DB read failed, falling back to defaults:",
      err instanceof Error ? err.message : String(err),
    );
    return DEFAULTS;
  }
}

/** Null when no vendor has a key at all — the caller's cue to let the browser speak. */
export async function resolveVoiceRoute(kind: VoiceRouteKind): Promise<VoiceRoute | null> {
  const settings = await getVoiceSettings();
  const chosen = kind === "stt" ? settings.sttProvider : settings.ttsProvider;
  const other: VoiceProviderName = chosen === "SARVAM" ? "GEMINI" : "SARVAM";

  for (const [provider, fellBack] of [
    [chosen, false],
    [other, true],
  ] as const) {
    const apiKey = await getProviderKey(VOICE_PROVIDER_META[provider].credential);
    if (!apiKey) continue;
    return {
      provider,
      voice: provider === "SARVAM" ? settings.sarvamVoice : settings.geminiVoice,
      apiKey,
      fellBack,
    };
  }
  return null;
}

export type VoiceSettingsWriteResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

export async function updateVoiceSettings(params: {
  sttProvider: VoiceProviderName;
  ttsProvider: VoiceProviderName;
  sarvamVoice: string;
  geminiVoice: string;
  actorId: string;
  actorRole: Role;
}): Promise<VoiceSettingsWriteResult> {
  const { sttProvider, ttsProvider, sarvamVoice, geminiVoice, actorId, actorRole } = params;

  if (!isSarvamVoice(sarvamVoice)) {
    return { ok: false, error: "INVALID_VOICE", message: "Ye Sarvam speaker maujood nahi hai.", status: 422 };
  }
  if (!isGeminiVoice(geminiVoice)) {
    return { ok: false, error: "INVALID_VOICE", message: "Ye Gemini voice maujood nahi hai.", status: 422 };
  }

  const existing = await prisma.voiceSettings.findUnique({ where: { id: SINGLETON_ID } });
  const previousValue = existing
    ? `stt=${existing.sttProvider}:${existing.sarvamVoice}/${existing.geminiVoice}, tts=${existing.ttsProvider}`
    : `stt=${DEFAULTS.sttProvider}, tts=${DEFAULTS.ttsProvider} (default)`;

  await prisma.$transaction(async (tx) => {
    await tx.voiceSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, sttProvider, ttsProvider, sarvamVoice, geminiVoice, updatedBy: actorId },
      update: { sttProvider, ttsProvider, sarvamVoice, geminiVoice, updatedBy: actorId },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "VOICE_ROUTE_UPDATED",
        targetType: "voice_settings",
        targetId: SINGLETON_ID,
        previousValue,
        newValue: `stt=${sttProvider}:${sarvamVoice}/${geminiVoice}, tts=${ttsProvider}`,
      },
    });
  });

  cache = null;
  return { ok: true };
}

/** Test seam — forces the next read to hit the DB. */
export function invalidateVoiceSettingsCache() {
  cache = null;
}
