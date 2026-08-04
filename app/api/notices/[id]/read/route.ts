import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { markRead } from "@/lib/services/notice/noticeService";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  // markRead is scoped by userId, so a wrong id is a silent no-op rather than
  // a 404 that would confirm someone else's notice exists.
  await markRead(user.id, id);
  return NextResponse.json({ ok: true });
}
