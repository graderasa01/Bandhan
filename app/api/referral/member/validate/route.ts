import { NextResponse } from "next/server";
import { resolveMemberReferralCode } from "@/lib/services/referral/memberCode";
import { createRateLimiter } from "@/app/api/_shared/rateLimit";

export const runtime = "nodejs";

/** Same ceiling as the partner sibling, for the same reason. */
const rateLimited = createRateLimiter({ windowMs: 60_000, max: 10 });

/**
 * "Kisne bulaya hai" on the register page — the member half of
 * `/api/referral/validate`.
 *
 * ## What it returns, and what it will not
 *
 * A first name. Nothing else — not the surname, not a city, not a user id, not
 * a profile link. The person on the other end of this link already knows who
 * sent it to them; this endpoint's job is to confirm the code is live, not to
 * describe a member to a stranger who is guessing codes.
 *
 * Deliberately 200 with `valid: false`, never 404 — the same rule the partner
 * route follows, because a distinguishable not-found turns this into a
 * code-enumeration oracle.
 *
 * Usability is decided by `resolveMemberReferralCode`, the same function the
 * landing route and the signup attribution use, so this banner can never call
 * a link invalid that the signup then credits (or the reverse).
 */
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ valid: false, message: "Thodi der baad try karein." }, { status: 429 });
  }

  const codeParam = new URL(req.url).searchParams.get("code");
  if (!codeParam) return NextResponse.json({ valid: false });

  const owner = await resolveMemberReferralCode(codeParam);
  if (!owner) return NextResponse.json({ valid: false });

  return NextResponse.json({ valid: true, inviterFirstName: owner.ownerFirstName });
}
