import "server-only";

/**
 * A per-user brake on the two endpoints that spend vendor money per second of
 * audio (`/api/speech/stt`, `/api/speech/tts`).
 *
 * Deliberately **not** the `voiceOnboarding` kill switch and **not** the daily
 * interview turn cap. Those two are about the profile-building flow; these
 * endpoints also carry Grio's voice, and killing the assistant's speech because
 * somebody switched off voice onboarding would be a coupling nobody asked for.
 * What this stops is the narrow thing: one account holding the microphone open
 * — or a script pointed at the path — burning the deployment's key.
 *
 * In-process and per-instance, which is the honest shape for this app: a single
 * Railway container, no Redis, and a limiter that needs infrastructure to exist
 * is a limiter that does not get shipped. Two instances would each allow the
 * window, which is a factor-of-two error on a bound whose whole purpose is to
 * stop a factor-of-a-thousand one.
 */

/** Requests per user per rolling window, per endpoint kind. */
const LIMIT = 120;
const WINDOW_MS = 10 * 60 * 1000;

/** userId+kind → request timestamps inside the current window. */
const hits = new Map<string, number[]>();

export type SpeechRateKind = "stt" | "tts";

export function checkSpeechRate(
  userId: string,
  kind: SpeechRateKind,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const key = `${kind}:${userId}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    const oldest = recent[0];
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)) };
  }

  recent.push(now);
  hits.set(key, recent);

  // Cheap sweep so an idle instance does not hold every user it ever served.
  if (hits.size > 500) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }

  return { ok: true };
}

/** Test seam. */
export function resetSpeechRateLimit() {
  hits.clear();
}
