import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { getPlanContext, isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getTodayAiAskCount } from "@/lib/ai/quota";
import { checkRate } from "@/lib/services/security/requestRateLimit";
import { DISCOVER_QUERY_MAX_CHARS, parseDiscoverFilters, type DiscoverApiError } from "@/lib/discovery/contract";
import { parseDiscoverIntent } from "@/lib/services/discovery/intentService";

export const runtime = "nodejs";

/**
 * `POST /api/discover/intent` — one typed/spoken sentence → validated filters
 * for the user to *confirm*. Nothing is searched here; the client shows the
 * returned summary and chips and only calls `/api/discover/search` after a
 * "Haan, profiles dikhao".
 *
 * Gated on the same capability as the search itself, and checked *before* the
 * model is called, so a member who cannot search never spends a call.
 *
 * Two brakes, because D-90 opened Advanced Discovery to FREE:
 *   • a per-user in-process rate limit (one person holding the mic open is the
 *     realistic way to burn this key), and
 *   • the daily `aiAskPerDay` allowance, shared with the reel's "AI se poocho"
 *     — the parse is a model call per search. Manual filters keep working when
 *     it runs out; only turning a sentence into filters stops.
 */

const BodySchema = z
  .object({
    query: z.string().min(1).max(DISCOVER_QUERY_MAX_CHARS * 2),
    currentFilters: z.unknown().optional(),
    allowClarification: z.boolean().optional(),
  })
  .strict();

const RATE = { limit: 30, windowMs: 10 * 60 * 1000 };

function fail(code: DiscoverApiError["code"], message: string, status: number, extra?: Partial<DiscoverApiError>) {
  const body: DiscoverApiError = { ok: false, code, message, ...extra };
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const gate = await isFeatureAvailable(user.id, "advancedDiscovery", (ctx) => ctx.features.advancedDiscovery);
  if (!gate.allowed) return fail("plan", "AI search abhi aapke liye khuli nahi hai.", 403);

  const rate = checkRate(`discover-intent:${user.id}`, RATE);
  if (!rate.ok) {
    return fail("rate_limited", "Thodi der me dobara try karein — bahut saari searches ek saath ho gayi.", 429, { retryAfterSeconds: rate.retryAfterSeconds });
  }

  // The plan's own number, not `effectiveAiAskLimit`: AI_ASK reward credits are
  // spent by the reel route that granted them, and this route does not consume
  // one, so it must not borrow from them either.
  const [planCtx, askedToday] = await Promise.all([getPlanContext(user.id), getTodayAiAskCount(user.id)]);
  const askLimit = planCtx.features.aiAskPerDay;
  if (askLimit !== null && askedToday >= askLimit) {
    return fail(
      "rate_limited",
      `Aaj ke ${askLimit} AI sawaal ho gaye — filters haath se chun lein, wo poori tarah chalte hain. Kal phir bol kar dhoondh sakte hain.`,
      429,
    );
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) return fail("validation", "Query valid nahi hai — thoda chhota ya saaf likhein.", 422);

  const current = parseDiscoverFilters(parsed.data.currentFilters ?? {});
  if (!current.ok) return fail("validation", current.message, 422);

  const viewer = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: { gender: true, partnerPreferences: { select: { lookingForGender: true } } },
  });
  const saved = viewer?.partnerPreferences?.lookingForGender;
  const defaultLookingFor: "Ladka" | "Ladki" | null =
    saved === "Ladka" || saved === "Ladki" ? saved : viewer?.gender === "Ladka" ? "Ladki" : viewer?.gender === "Ladki" ? "Ladka" : null;

  const outcome = await parseDiscoverIntent({
    userId: user.id,
    query: parsed.data.query,
    currentFilters: current.filters,
    defaultLookingFor,
    allowClarification: parsed.data.allowClarification ?? true,
  });

  if (!outcome.ok) {
    // 200 with ok:false rather than a 5xx: the client treats "AI unavailable"
    // as a soft state (manual filters stay fully usable), not as a crash.
    return NextResponse.json({ ok: false, code: outcome.code === "validation" ? "validation" : "ai_unavailable", message: outcome.message } satisfies DiscoverApiError, {
      status: outcome.code === "validation" ? 422 : 200,
    });
  }
  return NextResponse.json(outcome);
}
