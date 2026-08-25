import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requestPasswordReset } from "@/lib/services/auth/passwordResetService";

export const runtime = "nodejs";

const BodySchema = z.object({ mobile_or_email: z.string().trim().min(1) });

/**
 * Always `{ ok: true }` — see `requestPasswordReset` for why the response
 * can't say more than that without leaking whether an account exists.
 */
export async function POST(req: Request) {
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: "Mobile ya email daaliye." },
      { status: 422 },
    );
  }

  // The request's own origin, not APP_URL/NEXT_PUBLIC_APP_URL — see
  // passwordResetService.ts's header for why: both are unset in production
  // today, and a link built from whatever host actually served this request
  // works regardless of that.
  const origin = new URL(req.url).origin;

  await requestPasswordReset(parsed.data.mobile_or_email, origin);
  return NextResponse.json({ ok: true });
}
