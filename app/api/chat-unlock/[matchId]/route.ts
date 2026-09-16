import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getT } from "@/lib/i18n/server";
import { CHAT_UNLOCK_ITEM_CODE, quoteChatUnlock, unlockWithCredit } from "@/lib/services/chat/chatUnlockService";
import { createItemCheckout } from "@/lib/services/items/itemPurchaseService";
import type { ChatUnlockActionResponse } from "@/lib/contracts/chatUnlock";

export const runtime = "nodejs";

/**
 * Opening one match's chat (D-90).
 *
 * GET quotes it. POST does the cheapest thing that works, in order: nothing if
 * the chat is already open, a held credit if there is one, otherwise a
 * CHAT_UNLOCK checkout. Like every checkout in this app, the POST grants
 * nothing on the paid path — the chat opens when the capture lands.
 */

export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { matchId } = await params;
  return NextResponse.json({ ok: true, quote: await quoteChatUnlock(user.id, matchId) });
}

export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { matchId } = await params;

  const quote = await quoteChatUnlock(user.id, matchId);

  if (quote.state === "unavailable") {
    return NextResponse.json({ ok: false, message: quote.message } satisfies ChatUnlockActionResponse, { status: 403 });
  }
  if (quote.state === "open") {
    return NextResponse.json({ ok: true, state: "open" } satisfies ChatUnlockActionResponse);
  }

  if (quote.state === "credit") {
    const result = await unlockWithCredit(user.id, matchId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message } satisfies ChatUnlockActionResponse, {
        status: result.status,
      });
    }
    return NextResponse.json({ ok: true, state: "open" } satisfies ChatUnlockActionResponse);
  }

  const t = await getT();
  const checkout = await createItemCheckout(user.id, CHAT_UNLOCK_ITEM_CODE, { matchId }, t);
  if (!checkout.ok) {
    return NextResponse.json({ ok: false, message: checkout.message } satisfies ChatUnlockActionResponse, { status: 422 });
  }
  return NextResponse.json({ ok: true, checkoutUrl: checkout.checkoutUrl } satisfies ChatUnlockActionResponse);
}
