import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { createCheckout } from "@/lib/services/payments/subscriptionService";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const BodySchema = z.object({
  // Validated against the live catalog inside `quoteCheckout` — an enum here
  // would silently reject any plan an admin created.
  planCode: z.string().trim().min(2).max(24),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid plan." }, { status: 422 });
  }

  const t = await getT();
  const result = await createCheckout(user.id, parsed.data.planCode, t);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    checkoutUrl: result.checkoutUrl,
    quote: result.quote,
    isTest: result.isTest,
  });
}
