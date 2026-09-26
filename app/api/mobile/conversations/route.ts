import { NextResponse } from "next/server";
import { getConversationsData } from "@/lib/data/messagesData";
import { requireMember } from "../_shared/member";

export const runtime = "nodejs";

/**
 * The chat list — `/user/messages`'s own `getConversationsData`, including the
 * D-90 `chatOpen` flag, so the app shows the same lock line the web does. A
 * thread is read and written through the existing `/api/messages/[matchId]`,
 * which is also where the chat gate is enforced.
 */
export async function GET() {
  const { user, response } = await requireMember();
  if (!user) return response;

  const conversations = await getConversationsData(user.id);
  return NextResponse.json({ ok: true, conversations });
}
