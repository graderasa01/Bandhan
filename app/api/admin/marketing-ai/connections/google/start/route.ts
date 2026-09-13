import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  GOOGLE_CALLBACK_PATH,
  MARKETING_OAUTH_STATE_COOKIE,
  buildConnectState,
  googleConnectUrl,
  isGoogleMarketingProvider,
  marketingOAuthOrigin,
} from "@/lib/marketing/connectors/googleOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Connect with Google" for one marketing provider. A GET that redirects,
 * like Google Sign-In's start route — the browser has to navigate to
 * Google either way. Admin-only, checked here rather than by middleware
 * because a redirect endpoint under /api is not in the route matrix.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  const origin = marketingOAuthOrigin(req);
  if (!user || user.role !== "ADMIN") return NextResponse.redirect(`${origin}/admin/login?next=/admin/marketing-ai`);

  const provider = new URL(req.url).searchParams.get("provider") ?? "";
  if (!isGoogleMarketingProvider(provider)) {
    return NextResponse.redirect(`${origin}/admin/marketing-ai?connect=invalid_provider`);
  }

  const { state, cookieValue } = buildConnectState(provider);
  const url = googleConnectUrl({ provider, redirectUri: `${origin}${GOOGLE_CALLBACK_PATH}`, state });
  if (!url) return NextResponse.redirect(`${origin}/admin/marketing-ai?connect=google_unavailable`);

  const res = NextResponse.redirect(url);
  res.cookies.set(MARKETING_OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    // `lax`: the callback is a top-level navigation from accounts.google.com.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
