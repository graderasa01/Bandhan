import { NextResponse } from "next/server";
import { getCurrentUser, refreshSession, sessionClaimsStale } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/landingPath";
import { postLoginPathWithNext } from "@/lib/auth/postLoginPath";

export const runtime = "nodejs";

/**
 * Re-signs this browser's session cookie from the live user row, then carries
 * on to `next`: the one step `/bolo` cannot take itself, because a page may
 * not set a cookie and a route handler may.
 *
 * `/bolo` sends a member here when middleware bounced them off an ACTIVE-only
 * page on a cookie that still says INCOMPLETE while the row already says
 * ACTIVE (see `sessionClaimsStale`). The fresh cookie is set on this redirect,
 * so the browser presents it on the very next hop and middleware lets the page
 * through.
 *
 * A GET because it sits in a redirect chain. The worst it can be made to do is
 * bring the cookie of the person already holding it in line with the database,
 * and `next` goes through `safeNextPath` like every other `?next=`.
 */

/**
 * Relative on purpose, as in app/api/auth/handoff/route.ts: the browser resolves
 * it against the host it asked, while `req.url` behind Railway's proxy names the
 * container.
 */
function go(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  const next = safeNextPath(new URL(req.url).searchParams.get("next"));
  const user = await getCurrentUser();
  if (!user) return go(next ? `/login?next=${encodeURIComponent(next)}` : "/login");

  if (await sessionClaimsStale(user)) await refreshSession(user, req);
  return go(await postLoginPathWithNext(user, next));
}
