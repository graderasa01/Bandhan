import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { recordDemandSignal } from "@/lib/services/pilot/pilotCityService";
import { SERVICE_KINDS } from "@/lib/services/marketplace/servicePolicy";

export const runtime = "nodejs";

const KINDS = SERVICE_KINDS.map((s) => s.kind) as [string, ...string[]];

const BodySchema = z.object({
  city: z.string().trim().min(1, "Sheher ka naam likhiye.").max(100),
  state: z.string().trim().max(100).optional().or(z.literal("")),
  /// The client's account of what it had on screen — a label on the row, never
  /// a permission. What matters is the fact underneath it: this person wants
  /// this city, and today we cannot serve them.
  reason: z.enum(["NO_PILOT_CITY", "ALL_PARTNERS_FULL", "NO_PARTNER_FOR_KIND"]),
  kind: z.enum(KINDS).optional(),
});

/**
 * "Batayein jab yahan koi ho."
 *
 * The marketplace itself is public, and the honest empty state is shown to
 * everybody; this route is the part that needs an account, because a promise to
 * come back to somebody needs somewhere to come back to. A logged-out visitor
 * gets sent to sign in with the filter intact rather than being asked for a
 * phone number the product would then have to justify holding.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Galat input." },
      { status: 422 },
    );
  }

  const result = await recordDemandSignal({
    userId: user.id,
    city: parsed.data.city,
    state: parsed.data.state || null,
    reason: parsed.data.reason,
    serviceKind: (parsed.data.kind as never) ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    alreadyWaiting: result.alreadyWaiting,
    message: result.alreadyWaiting
      ? "Aap pehle se is sheher ki list me hain — khulte hi bata denge."
      : "Likh liya. Jaise hi is sheher me partner aayenge, aapko bata denge.",
  });
}
