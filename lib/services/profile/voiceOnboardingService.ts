import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { resolveVoiceRoute } from "@/lib/speech/voiceConfig";

/**
 * Who may build a profile by speaking, and how much of it costs money.
 *
 * ## What changed, and why
 *
 * Voice-fill used to be an **admin-approved, per-user exception**: anybody
 * filling for themselves had to write a paragraph explaining why, and wait.
 * That gate was added to keep a per-minute speech bill from running away, but
 * it solved the cost problem by removing the feature from the people who
 * benefit most from it — someone who finds typing hard is exactly who ends up
 * asking permission to talk.
 *
 * Cost is now controlled where cost actually is: per-turn. Four brakes, none of
 * which asks the user for anything.
 *
 *   - **Kill switch** — the `voiceOnboarding` feature flag. OFF and every
 *     spoken turn stops at once, no redeploy, and the UI falls back to typing.
 *   - **A configured provider** — no Gemini/Sarvam key, no server speech. The
 *     browser's own voice still works, so the flow degrades rather than dies.
 *   - **A daily turn cap** — counted from the `AiInteraction` rows the
 *     extraction call already writes. No new table, no new counter to drift.
 *   - **A session turn cap** — `MAX_SESSION_TURNS`, enforced client-side, which
 *     keeps one sitting short by design rather than by willpower.
 *
 * The plan ladder is deliberately not consulted: this is how a profile gets
 * *created*, and charging for that would mean the emptiest accounts are the
 * ones we refuse to help.
 */

/** One sitting. Long enough for the eight minimum fields at 2-3 per turn, with room to miss a few. */
export const MAX_SESSION_TURNS = 14;

/**
 * Spoken turns per user per day across all sessions.
 *
 * Sized against the real ask: the minimum eight fields take three to four
 * turns. Forty is a dozen restarts, which is generous for a genuine user and
 * still bounds what one account can spend in a day.
 */
export const MAX_DAILY_TURNS = 40;

/** The `AiInteraction.feature` tag the interview turn writes. */
const INTERVIEW_FEATURE = "profile_interview";

export type VoiceUnavailableReason = "disabled" | "not_configured" | "daily_limit";

export interface VoiceOnboardingAvailability {
  /** Whether a spoken turn may be attempted at all. */
  available: boolean;
  reason: VoiceUnavailableReason | null;
  /**
   * True when a server-side speech vendor answered. False means the browser's
   * own recogniser/synthesiser is the only voice available — usable, but flat
   * and English-accented, so the UI says so rather than pretending.
   */
  serverSpeech: boolean;
  turnsUsedToday: number;
  turnsLeftToday: number;
  maxSessionTurns: number;
}

/** Turns this user has spent on the extraction model since midnight. */
async function turnsUsedToday(userId: string): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  try {
    return await prisma.aiInteraction.count({
      where: { userId, feature: INTERVIEW_FEATURE, createdAt: { gte: since } },
    });
  } catch (err) {
    // A counter that cannot be read must not become a lock-out — the kill
    // switch is the deliberate way to stop voice, not a database hiccup.
    console.error(
      "[voice:onboarding] turn count failed, treating as zero:",
      err instanceof Error ? err.message : String(err),
    );
    return 0;
  }
}

export async function getVoiceOnboardingAvailability(
  userId: string,
): Promise<VoiceOnboardingAvailability> {
  const [flag, route, used] = await Promise.all([
    isFeatureAvailable(userId, "voiceOnboarding"),
    resolveVoiceRoute("tts").catch(() => null),
    turnsUsedToday(userId),
  ]);

  const base = {
    serverSpeech: Boolean(route),
    turnsUsedToday: used,
    turnsLeftToday: Math.max(0, MAX_DAILY_TURNS - used),
    maxSessionTurns: MAX_SESSION_TURNS,
  };

  if (!flag.allowed) return { ...base, available: false, reason: "disabled" };
  if (used >= MAX_DAILY_TURNS) return { ...base, available: false, reason: "daily_limit" };
  // No vendor key at all is *not* unavailable: the browser can still listen and
  // speak. It is only reported so the UI can set expectations.
  return { ...base, available: true, reason: null };
}

/**
 * The turn-level gate, called by `/api/profile/interview` before it spends a
 * model call. Separate from the availability read above because this one is a
 * refusal, not a description.
 */
export async function assertVoiceTurnAllowed(
  userId: string | null,
): Promise<{ ok: true } | { ok: false; reason: VoiceUnavailableReason; message: string }> {
  // An anonymous caller has no counter to spend against, so it gets none of the
  // paid path. (The route below still answers — typed text from a logged-out
  // preview is cheap and was always allowed.)
  if (!userId) return { ok: true };

  const availability = await getVoiceOnboardingAvailability(userId);
  if (availability.available) return { ok: true };

  return {
    ok: false,
    reason: availability.reason ?? "disabled",
    message:
      availability.reason === "daily_limit"
        ? "Aaj ke liye voice ki limit poori ho gayi. Type karke bhar sakte hain — kal phir bol sakte hain."
        : "Voice abhi band hai. Aap type karke ya biodata upload karke bhar sakte hain.",
  };
}
