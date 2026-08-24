import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getVerificationStatus } from "@/lib/services/verification/contactVerification/contactVerificationService";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const status = await getVerificationStatus(user.id);
  return NextResponse.json({ ok: true, status });
}
