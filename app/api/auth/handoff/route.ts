import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createSession, destroySession, getCurrentUser, isNativeClient } from "@/lib/auth/session";
import { redeemWebHandoff } from "@/lib/services/auth/webHandoffService";

export const runtime = "nodejs";

/**
 * Where the app's browser lands with a handoff code (`webHandoffService`):
 * spend the code, sign this browser in as the member who minted it, and send
 * it on to the one checkout page the code was minted for.
 *
 * A top-level navigation, so every failure is a redirect to `/login?error=…`
 * rather than a JSON body — the same reasoning as the Google callback.
 */

/**
 * Relative on purpose: the browser resolves it against the host it asked,
 * which is right on localhost and on the domain alike, while `req.url` behind
 * Railway's proxy names the container (see `lib/utils/appOrigin.ts`). The
 * target is only ever the stored checkout path or the login page.
 */
function go(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      // The code is spent by now, but it has no business in anyone's Referer.
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(req: Request) {
  // The app itself must never spend a code: with the native header,
  // `createSession` would set no cookie and the code would be gone for nothing.
  if (await isNativeClient()) {
    return NextResponse.json({ error: "BROWSER_ONLY", message: "Ye link browser ke liye hai." }, { status: 400 });
  }

  const code = new URL(req.url).searchParams.get("code") ?? "";
  const redeemed = await redeemWebHandoff(code);
  if (!redeemed.ok) return go("/login?error=handoff_expired");

  const user = await prisma.user.findUnique({ where: { id: redeemed.userId } });
  if (!user || user.role !== "USER") return go("/login?error=handoff_expired");
  if (user.deletedAt || user.status === "BLOCKED" || user.status === "DELETED" || user.status === "SUSPENDED") {
    return go("/login?error=account_blocked");
  }

  // Already this member in this browser: nothing to sign. Anybody else's
  // session ends here instead of being left alive behind a cookie that is about
  // to be overwritten — the way `refreshSession` treats the one it replaces.
  const current = await getCurrentUser();
  if (current?.id !== user.id) {
    if (current) await destroySession();
    await createSession({
      userId: user.id,
      role: user.role,
      status: user.status,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
      // The one-day tier: this browser was borrowed for a payment, not chosen
      // as somewhere to stay signed in.
      rememberMe: false,
    });
  }

  console.info(`[auth:handoff] user=${user.id}`);
  return go(redeemed.path);
}
