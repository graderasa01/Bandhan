import { NextResponse } from "next/server";
import {
  GOOGLE_STATE_COOKIE,
  buildState,
  googleAuthUrl,
  googleConfig,
  googleRedirectUri,
} from "@/lib/auth/google";

export const runtime = "nodejs";

/**
 * Kicks off Google Sign-In.
 *
 * A GET that redirects, rather than a POST returning a URL for the client to
 * follow, because the browser has to *navigate* to Google either way — and a
 * plain `<a href>` on the login page means the button keeps working with
 * JavaScript still loading, which is exactly when a user on a slow connection
 * is most likely to tap it.
 */
export async function GET(req: Request) {
  const config = googleConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/login?error=google_unavailable", req.url));
  }

  const next = new URL(req.url).searchParams.get("next");
  const { state, cookieValue } = buildState(next);

  const res = NextResponse.redirect(
    googleAuthUrl({
      clientId: config.clientId,
      redirectUri: googleRedirectUri(req),
      state,
    }),
  );

  res.cookies.set(GOOGLE_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    // `lax` and not `strict`: the callback arrives as a top-level navigation
    // from accounts.google.com, and a strict cookie would not be sent with it —
    // the CSRF check would then fail for every legitimate sign-in.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  return res;
}
