import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { cancelSubscription } from "@/lib/services/payments/subscriptionService";

export const runtime = "nodejs";

export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const result = await cancelSubscription(user.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true, endsAt: result.endsAt?.toISOString() });
}
