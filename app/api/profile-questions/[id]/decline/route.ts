import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { declineProfileQuestion } from "@/lib/services/askBridge/profileQuestionService";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const ok = await declineProfileQuestion(user.id, id);
  if (!ok) {
    return NextResponse.json({ ok: false, message: "Ye sawaal available nahi hai." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
