import { NextResponse } from "next/server";
import { getProviderKey } from "@/lib/ai/credentials";
import { getCurrentUser } from "@/lib/auth/session";
import { BOLO_LIVE_MODEL, boloLiveConfig } from "@/lib/bolo/agent";
import { getRollout, resolveAccess } from "@/lib/services/flags/featureFlagService";
import { checkRate, clientIp } from "@/lib/services/security/requestRateLimit";
import { getVoiceSettings } from "@/lib/speech/voiceConfig";

export const runtime = "nodejs";

/**
 * Mint a one-use Gemini Live credential for the spoken front door — for a
 * visitor with no account, which is the whole point of `/bolo`.
 *
 * The permanent key never leaves the server. What the browser gets is an
 * ephemeral token whose *setup is locked to this app's own brief*
 * (`bidiGenerateContentSetup` + no field mask = every field locked): model,
 * Grio's instruction, the five tools, audio out. A copied token can only ever
 * run this exact conversation, and only once, and only if it connects inside
 * the next two minutes.
 *
 * Brakes, since there is no user to count against:
 *   - the `voiceOnboarding` kill switch — OFF stops this door with no deploy;
 *   - a per-IP cap on mints (a session is ~3 minutes; a dozen an hour is a
 *     family trying twice on three phones, not a script);
 *   - Gemini's own 15-minute audio session limit, which the page also enforces
 *     with its own idle timeout.
 *
 * Signed-in members are not refused — the page redirects them before it ever
 * asks — but they are counted by user id rather than address.
 */

const MINTS_PER_IP = { limit: 12, windowMs: 60 * 60 * 1000 };
const TOKEN_TTL_MS = 10 * 60 * 1000;
const CONNECT_WINDOW_MS = 2 * 60 * 1000;

export async function POST(req: Request) {
  const rollout = await getRollout("voiceOnboarding");
  if (resolveAccess(rollout, false) === "closed") {
    return NextResponse.json({ ok: false, message: "disabled" }, { status: 409 });
  }

  const user = await getCurrentUser().catch(() => null);
  const rate = checkRate(`bolo:token:${user ? `u:${user.id}` : `ip:${clientIp(req)}`}`, MINTS_PER_IP);
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, message: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  const apiKey = await getProviderKey("GEMINI");
  if (!apiKey) return NextResponse.json({ ok: false, message: "not_configured" }, { status: 503 });

  const settings = await getVoiceSettings();
  const config = boloLiveConfig(settings.geminiVoice);
  const now = Date.now();

  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + TOKEN_TTL_MS).toISOString(),
        newSessionExpireTime: new Date(now + CONNECT_WINDOW_MS).toISOString(),
        bidiGenerateContentSetup: {
          model: `models/${BOLO_LIVE_MODEL}`,
          generationConfig: {
            responseModalities: config.responseModalities,
            temperature: config.temperature,
            speechConfig: config.speechConfig,
          },
          systemInstruction: config.systemInstruction,
          tools: config.tools,
          inputAudioTranscription: config.inputAudioTranscription,
          outputAudioTranscription: config.outputAudioTranscription,
        },
      }),
    });

    if (!upstream.ok) {
      console.error("[bolo:live-token] gemini failed:", upstream.status, (await upstream.text()).slice(0, 200));
      return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
    }
    const body = (await upstream.json()) as { name?: string };
    if (!body.name) return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });

    return NextResponse.json(
      { ok: true, token: body.name, model: BOLO_LIVE_MODEL, voice: settings.geminiVoice },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[bolo:live-token] request failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
  }
}
