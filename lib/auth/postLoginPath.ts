import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { landingPathForRole, partnerLandingPath, safeNextPath } from "@/lib/auth/landingPath";
import type { Role, UserStatus } from "@/lib/contracts/auth";

/**
 * The DB-aware half of `landingPath.ts` — see that file for why the two are
 * separate. Everything that finishes an authentication (login API, Google
 * callback, register) and every "you're already logged in, go inside" guard
 * calls this so they can't drift apart again.
 */
export async function postLoginPath(user: {
  id: string;
  role: Role;
  status: UserStatus;
}): Promise<string> {
  if (user.role === "PARTNER") {
    const partner = await prisma.partner.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    return partnerLandingPath(partner?.status ?? null);
  }
  return landingPathForRole(user.role, user.status);
}

/**
 * `?next=` wins when it's a safe same-origin path, otherwise the role's own
 * home. Middleware is what puts `next` there in the first place, so honouring
 * it is what makes "you were trying to reach X, log in and we'll take you to
 * X" work — but it is never trusted blindly (see `safeNextPath`).
 */
export async function postLoginPathWithNext(
  user: { id: string; role: Role; status: UserStatus },
  next: string | null | undefined,
): Promise<string> {
  return safeNextPath(next) ?? (await postLoginPath(user));
}

/**
 * Guard for the public entry pages (`/`, `/login`, `/register`): someone who
 * is already signed in gets sent inside instead of being shown a marketing
 * page with a "Login" button they don't need. `/admin/login` has always done
 * this; the other three never did, which is how a logged-in account could sit
 * on the homepage indefinitely.
 *
 * Throws (that's how `redirect()` works) — call it before doing any work.
 */
export async function redirectSignedInUser(next?: string | null): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  redirect(await postLoginPathWithNext(user, next));
}
