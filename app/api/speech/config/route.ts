import { NextResponse } from "next/server";
import { getProviderKey } from "@/lib/ai/credentials";

export const runtime = "nodejs";

/**
 * Lets client-side speech providers know, without ever seeing the key
 * itself, whether the real voice API is wired up. The STT provider checks
 * this before ever touching the microphone — discovering "not configured"
 * only after a user has already recorded an answer is a worse fallback than
 * skipping straight to the browser's own voice.
 */
export async function GET() {
  // Reads the same resolver the STT/TTS routes do, so a key set from
  // /admin/ai-settings flips this to `true` without a restart — otherwise the
  // client would keep choosing browser voice against a working Sarvam key.
  const configured = Boolean(await getProviderKey("SARVAM"));
  return NextResponse.json({ stt: configured, tts: configured });
}
