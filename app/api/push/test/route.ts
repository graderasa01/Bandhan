import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { sendPushToUser } from "@/lib/services/notice/pushService";

export const runtime = "nodejs";

/**
 * "Send a test notification to me."
 *
 * Self-targeted only — there is no userId parameter, so this endpoint cannot
 * be pointed at anybody else. It exists because push permission is the one
 * setting a user genuinely cannot verify by looking at it: the toggle can read
 * "on" while the OS has notifications muted for the browser, the site is in a
 * focus-mode blocklist, or the endpoint has quietly expired. Returning the
 * delivered count turns "it should work" into "3 devices par gaya".
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const delivered = await sendPushToUser(user.id, {
    title: "BandhanTak",
    body: "Notifications chalu hain. Ab koi bhi khabar aate hi yahin dikh jaayegi.",
    url: "/user/inbox",
    tag: "test",
  });

  return NextResponse.json({ ok: true, delivered });
}
