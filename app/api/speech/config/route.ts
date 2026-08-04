import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Lets client-side speech providers know, without ever seeing the key
 * itself, whether the real voice API is wired up. The STT provider checks
 * this before ever touching the microphone — discovering "not configured"
 * only after a user has already recorded an answer is a worse fallback than
 * skipping straight to the browser's own voice.
 */
export async function GET() {
  const configured = Boolean(process.env.SARVAM_API_KEY);
  return NextResponse.json({ stt: configured, tts: configured });
}
