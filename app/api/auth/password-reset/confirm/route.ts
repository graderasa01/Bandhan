import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { consumePasswordReset } from "@/lib/services/auth/passwordResetService";

export const runtime = "nodejs";

const BodySchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Form sahi se bharein." }, { status: 422 });
  }

  const result = await consumePasswordReset(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    const status = result.error === "too_short" ? 422 : 400;
    return NextResponse.json({ error: result.error, message: result.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
