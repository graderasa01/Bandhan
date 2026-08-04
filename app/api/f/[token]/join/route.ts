import { NextResponse } from "next/server";
import { joinFamily } from "@/lib/services/family/familyService";

export const runtime = "nodejs";

const STATUS_CODE: Record<string, number> = { not_found: 404, expired: 410, revoked: 410 };
const MESSAGE: Record<string, string> = {
  not_found: "Ye invite link sahi nahi hai.",
  expired: "Ye invite link expire ho gaya hai.",
  revoked: "Ye invite band kar diya gaya hai.",
};

/**
 * POST-only, deliberately. WhatsApp/Telegram/iMessage fetch a shared link's
 * page server-side to build the preview card *before* a human taps it — if
 * joining happened on the page's own GET, that crawler request would consume
 * the one-time bind and the real family member would land on an already-
 * "used" invite. Requiring a distinct POST from an explicit button tap keeps
 * this to one tap for a person while staying inert for a bot.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await joinFamily(token, req.headers.get("user-agent") ?? undefined);

  if (result.status !== "joined") {
    return NextResponse.json(
      { error: result.status.toUpperCase(), message: MESSAGE[result.status] },
      { status: STATUS_CODE[result.status] ?? 400 },
    );
  }

  return NextResponse.json({ ok: true, displayName: result.member.displayName });
}
