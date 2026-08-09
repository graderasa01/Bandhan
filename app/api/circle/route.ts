import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import {
  getCircleView,
  registerForCircle,
  setMarriageTimeline,
  withdrawFromCircle,
} from "@/lib/services/circle/circleService";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

/**
 * Phase F — one route for the Circle's three write actions.
 *
 * Kept as a single `action`-discriminated POST rather than three sibling
 * routes because all three are the same shape (no body beyond the action,
 * one gate, one service call) and the page calls them from the same client
 * component. Three files would be three copies of the same eight lines.
 */

const OFF = NextResponse.json(
  { error: "FEATURE_OFF", message: "Serious Circle abhi band hai." },
  { status: 404 },
);

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const gate = await isFeatureAvailable(user.id, "seriousCircle");
  if (!gate.allowed) return OFF;

  const t = await getT();
  return NextResponse.json({ ok: true, view: await getCircleView(user.id, new Date(), t) });
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("timeline"),
    timeline: z.enum(["WITHIN_3_MONTHS", "WITHIN_6_MONTHS", "WITHIN_1_YEAR"]),
  }),
  z.object({ action: z.literal("register") }),
  z.object({ action: z.literal("withdraw") }),
]);

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const gate = await isFeatureAvailable(user.id, "seriousCircle");
  if (!gate.allowed) return OFF;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = ActionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const t = await getT();
  const input = parsed.data;
  const result =
    input.action === "timeline"
      ? await setMarriageTimeline(user.id, input.timeline, t)
      : input.action === "register"
        ? await registerForCircle(user.id, new Date(), t)
        : await withdrawFromCircle(user.id, new Date(), t);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, view: await getCircleView(user.id, new Date(), t) });
}
