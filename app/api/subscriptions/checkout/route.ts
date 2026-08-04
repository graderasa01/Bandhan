import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { createCheckout } from "@/lib/services/payments/subscriptionService";

export const runtime = "nodejs";

const BodySchema = z.object({
  planCode: z.enum(["BASIC", "STANDARD", "PREMIUM"]),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid plan." }, { status: 422 });
  }

  const result = await createCheckout(user.id, parsed.data.planCode);
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
