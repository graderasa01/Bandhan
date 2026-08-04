import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";
import { ROUTE_ACCESS_MATRIX, type RouteAccessRule } from "@/lib/contracts/auth";

/**
 * Edge-only gate (D-32's "three-layer check... enforced on frontend, backend").
 * This checks the JWT's own claims (role/status as of login) — fast, no DB
 * round-trip. The DB-authoritative check (session revoked? user blocked
 * since login?) happens in `getCurrentUser()` inside pages/route handlers,
 * which run in the Node runtime where Prisma actually works. Middleware
 * can't import that — Prisma Client isn't buildable for the Edge runtime.
 */
function matchRoute(pathname: string): RouteAccessRule | null {
  let best: RouteAccessRule | null = null;
  for (const rule of ROUTE_ACCESS_MATRIX) {
    if (pathname === rule.route || pathname.startsWith(`${rule.route}/`)) {
      if (!best || rule.route.length > best.route.length) best = rule;
    }
  }
  return best;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rule = matchRoute(pathname);
  if (!rule || rule.category === "public") return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  if (!claims) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (rule.blockedRoles?.includes(claims.role) || !rule.allowedRoles.includes(claims.role)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (
    rule.category === "user" &&
    rule.allowedUserStatuses &&
    !rule.allowedUserStatuses.includes(claims.status)
  ) {
    // Authenticated already — sending this to /login just bounces straight
    // back (they're logged in), which is the infinite loop an INCOMPLETE
    // user used to hit on every ACTIVE-only page. /profile/build is both
    // allowed for INCOMPLETE (see ROUTE_ACCESS_MATRIX) and the one place
    // that actually resolves the status: finishing the required fields
    // there flips the account to ACTIVE (see /api/profile/save-draft).
    return NextResponse.redirect(new URL("/profile/build", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/user/:path*", "/partner/:path*", "/admin/:path*", "/profile/:path*"],
};
