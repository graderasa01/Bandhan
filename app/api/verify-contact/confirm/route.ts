import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireUser } from "@/lib/auth/requireUser";
import { confirmCode } from "@/lib/services/verification/contactVerification/contactVerificationService";

export const runtime = "nodejs";

const BodySchema = z.object({
  channel: z.enum(["PHONE", "EMAIL"]),
  code: z.string().trim().regex(/^\d{4,8}$/, "Code sirf ank hone chahiye."),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Code sahi format me daalein." },
      { status: 422 },
    );
  }

  const result = await confirmCode(user.id, parsed.data.channel, parsed.data.code);
  if (!result.ok) {
    const status = result.error === "not_configured" ? 503 : result.error === "provider_error" ? 502 : 400;
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
