import { NextResponse } from "next/server";
import { toSarvamLanguageCode } from "@/lib/speech/sarvamLocale";
import { getProviderKey } from "@/lib/ai/credentials";

export const runtime = "nodejs";

// One consistent assistant voice for every question, same reasoning apps
// like this always use a single fixed voice regardless of who's being asked
// about — this is the one that plays when a request doesn't name another.
// Devesh picked "shreya" after listening to samples of priya/neha/kavya/
// shreya on 2026-08-04.
const DEFAULT_SPEAKER = "shreya";

// bulbul:v3's full named-voice catalog. `body.speaker` is checked against
// this rather than passed straight through, so a typo or garbage value can
// never turn into a wasted (paid) call to Sarvam with an invalid speaker —
// it just quietly falls back to the default instead.
const VOICES = new Set([
  "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran", "kavya",
  "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan", "sumit", "roopa", "kabir",
  "aayan", "ashutosh", "advait", "amelia", "sophia", "anand", "tanya", "tarun", "sunny",
  "mani", "gokul", "vijay", "shruti", "suhani", "mohit", "kavitha", "rehan", "soham", "rupali",
]);

export async function POST(req: Request) {
  const key = await getProviderKey("SARVAM");
  if (!key) {
    return NextResponse.json({ ok: false, message: "not_configured" }, { status: 503 });
  }

  let body: { text?: string; locale?: string; speaker?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "bad_request" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: false, message: "bad_request" }, { status: 400 });
  }
  // The REST endpoint tops out at 2500 characters. A batched voice turn is a
  // handful of short questions — nowhere close — but failing loudly here
  // beats silently truncating what gets spoken if that ever changes.
  if (text.length > 2500) {
    return NextResponse.json({ ok: false, message: "too_long" }, { status: 400 });
  }

  try {
    const upstream = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: toSarvamLanguageCode(body.locale ?? "hi-IN"),
        speaker: body.speaker && VOICES.has(body.speaker) ? body.speaker : DEFAULT_SPEAKER,
        model: "bulbul:v3",
        speech_sample_rate: 24000,
      }),
    });

    if (!upstream.ok) {
      console.error("[speech:tts] sarvam failed:", upstream.status, await upstream.text().catch(() => ""));
      return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
    }

    const data = (await upstream.json()) as { audios?: string[] };
    const audioBase64 = data.audios?.[0];
    if (!audioBase64) {
      return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
    }

    return new NextResponse(Buffer.from(audioBase64, "base64"), {
      headers: { "content-type": "audio/wav", "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[speech:tts] request failed:", err);
    return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
  }
}
