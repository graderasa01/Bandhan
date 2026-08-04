import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getConversationsData } from "@/lib/data/messagesData";
import { canChatInMatch } from "@/lib/services/circle/connectionService";
import type { ConciergeMatchOption } from "@/lib/contracts/concierge";

export const runtime = "nodejs";

/** Grio's "send to…" picker — only matches where a message can actually land, never the raw shortlist. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const conversations = await getConversationsData(user.id);
  const gates = await Promise.all(conversations.map((c) => canChatInMatch(user.id, c.matchId)));

  const matches: ConciergeMatchOption[] = conversations
    .filter((_, i) => gates[i].allowed)
    .map((c) => ({ matchId: c.matchId, name: c.other.displayName, photoUrl: c.other.photoUrl }));

  return NextResponse.json({ ok: true, matches });
}
