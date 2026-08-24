import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireUser } from "@/lib/auth/requireUser";
import { sendCode } from "@/lib/services/verification/contactVerification/contactVerificationService";

export const runtime = "nodejs";

const BodySchema = z.object({ channel: z.enum(["PHONE", "EMAIL"]) });

/** Also the resend endpoint — the cooldown/hourly checks inside `sendCode` are what make calling it twice safe. */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Channel PHONE ya EMAIL hona chahiye." }, { status: 422 });
  }

  const result = await sendCode(user.id, parsed.data.channel);
  if (!result.ok) {
    const status = result.error === "cooldown" || result.error === "rate_limited" ? 429 : result.error === "not_configured" ? 503 : 400;
    return NextResponse.json(
      { ok: false, error: result.error, message: result.message, retryAfterSeconds: "retryAfterSeconds" in result ? result.retryAfterSeconds : undefined },
      { status },
    );
  }

  return NextResponse.json({ ok: true });
}
