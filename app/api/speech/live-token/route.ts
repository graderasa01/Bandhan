import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { checkSpeechRate } from "@/lib/speech/speechRateLimit";
import { resolveVoiceRoute } from "@/lib/speech/voiceConfig";

export const runtime = "nodejs";

const MODEL = "gemini-3.5-transcribe-live";

/**
 * Mint a one-use Gemini Live credential for a signed-in profile builder.
 * The token is constrained server-side to text transcription, so even a
 * copied token cannot be repurposed for an arbitrary Gemini request.
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = checkSpeechRate(user.id, "live");
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, message: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  const route = await resolveVoiceRoute("stt");
  if (!route || route.provider !== "GEMINI") {
    return NextResponse.json({ ok: false, message: "gemini_live_not_configured" }, { status: 409 });
  }

  const now = Date.now();
  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": route.apiKey },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 5 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: `models/${MODEL}`,
          config: {
            responseModalities: ["TEXT"],
            inputAudioTranscription: { languageCodes: [], mode: "SMART" },
          },
        },
      }),
    });

    if (!upstream.ok) {
      console.error("[speech:live-token] gemini failed:", upstream.status);
      return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
    }

    const body = (await upstream.json()) as { name?: string };
    if (!body.name) return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });

    return NextResponse.json(
      { ok: true, token: body.name, model: MODEL },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[speech:live-token] request failed:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
  }
}
