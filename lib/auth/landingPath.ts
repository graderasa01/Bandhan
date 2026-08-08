import type { PartnerStatus, Role, UserStatus } from "@/lib/contracts/auth";

/**
 * "Where does this account actually live?" — the one answer, shared.
 *
 * Before this existed every caller guessed its own destination and they didn't
 * agree: `LoginPageView` pushed *everyone* to /user/dashboard without ever
 * looking at `role`, the Google callback did the same, and middleware bounced
 * anyone whose role didn't match a route to `/`. Together that meant a partner
 * who logged in successfully was handed the public marketing homepage —
 * logged in, with a header still offering them "Login".
 *
 * Deliberately split across two files:
 *
 *   • this one — pure, no Prisma, no `server-only`, so `middleware.ts` (Edge
 *     runtime) can import it. It knows only what a JWT carries: role + user
 *     status.
 *   • `postLoginPath.ts` — the DB-aware wrapper. A PARTNER's real destination
 *     depends on `Partner.status`, which is *not* in the JWT and changes
 *     without a re-login (an admin approving them five minutes ago), so it can
 *     only be resolved where Prisma runs.
 *
 * The edge answer for PARTNER is the optimistic one (`/partner/dashboard`);
 * `requirePartner()` on that page re-checks live status and forwards to
 * /partner/pending if they aren't approved yet. That ordering is fine — it
 * costs a pending partner one extra hop and keeps middleware free of a DB
 * round-trip on every single request.
 */

export const PARTNER_HOME = "/partner/dashboard";
export const PARTNER_PENDING = "/partner/pending";
export const PARTNER_APPLY = "/partner/register";
export const USER_HOME = "/user/dashboard";
export const PROFILE_BUILD = "/profile/build";
export const ADMIN_HOME = "/admin";
/** SUPPORT can't open /admin (ADMIN-only, see ROUTE_ACCESS_MATRIX) — the partner queue is the one page it may read. */
export const SUPPORT_HOME = "/admin/partners";

/** Role + JWT status only. Safe to call from the Edge runtime. */
export function landingPathForRole(role: Role, status: UserStatus): string {
  switch (role) {
    case "ADMIN":
      return ADMIN_HOME;
    case "SUPPORT":
      return SUPPORT_HOME;
    case "PARTNER":
      return PARTNER_HOME;
    default:
      // An INCOMPLETE profile goes straight back to the interview: the
      // dashboard would only show the same "finish your profile" gate as one
      // more click.
      return status === "INCOMPLETE" ? PROFILE_BUILD : USER_HOME;
  }
}

/** Where a PARTNER account belongs given its live `Partner` row (null = never applied). */
export function partnerLandingPath(partnerStatus: PartnerStatus | null): string {
  if (!partnerStatus) return PARTNER_APPLY;
  return partnerStatus === "APPROVED" || partnerStatus === "ACTIVE" || partnerStatus === "INACTIVE"
    ? PARTNER_HOME
    : PARTNER_PENDING;
}

/**
 * A `?next=` off the URL bar is attacker-controllable, so it is honoured only
 * when it is a same-origin path. `//evil.com` and `https://evil.com` both
 * start with a character we'd otherwise accept, hence the second test.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
