import { NextResponse } from "next/server";
import { resolveVoiceRoute } from "@/lib/speech/voiceConfig";

export const runtime = "nodejs";

/**
 * Lets client-side speech providers know, without ever seeing a key itself,
 * whether a real voice API is wired up. The STT provider checks this before
 * ever touching the microphone — discovering "not configured" only after a user
 * has already recorded an answer is a worse fallback than skipping straight to
 * the browser's own voice.
 *
 * Asks the same resolver the STT/TTS routes use, so this answers the question
 * that actually matters ("will a request succeed") rather than the narrower one
 * it used to ("is the Sarvam key set"). A deployment routed to Gemini now
 * reports `true` — before this, it would have told every client to fall back to
 * browser voice while a perfectly good Gemini key sat in the DB.
 *
 * Two booleans rather than provider names on purpose: nothing above
 * `SpeechProvider` is allowed to know which vendor is running (see that file's
 * header), and a client that could read the vendor would eventually branch on
 * it.
 */
export async function GET() {
  const [stt, tts] = await Promise.all([resolveVoiceRoute("stt"), resolveVoiceRoute("tts")]);
  return NextResponse.json({ stt: stt !== null, tts: tts !== null });
}
