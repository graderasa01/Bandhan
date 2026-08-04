import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getNotices, getUnreadCount, markAllRead } from "@/lib/services/notice/noticeService";

export const runtime = "nodejs";

/**
 * `?countOnly=1` exists for the header bell, which every authenticated page
 * mounts. Sending the full list on every navigation to render a number would
 * be the app's most frequent wasted payload.
 */
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const countOnly = new URL(req.url).searchParams.get("countOnly") === "1";
  if (countOnly) {
    return NextResponse.json({ ok: true, unreadCount: await getUnreadCount(user.id) });
  }

  const [notices, unreadCount] = await Promise.all([getNotices(user.id), getUnreadCount(user.id)]);
  return NextResponse.json({ ok: true, notices, unreadCount });
}

/** Mark-all-read. Per-notice read marking lives at /api/notices/[id]/read. */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const count = await markAllRead(user.id);
  return NextResponse.json({ ok: true, marked: count });
}
