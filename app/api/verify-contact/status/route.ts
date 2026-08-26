import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getVerificationStatus } from "@/lib/services/verification/contactVerification/contactVerificationService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const raw = new URL(req.url).searchParams.get("scope");
  const scope = raw === "PARTNER" ? "PARTNER" : "USER";

  const status = await getVerificationStatus(user.id, scope);
  return NextResponse.json({ ok: true, status });
}
