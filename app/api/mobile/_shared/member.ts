import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { requireUser } from "@/lib/auth/requireUser";

/**
 * The page rules of `ROUTE_ACCESS_MATRIX`, restated for the native app's read
 * routes.
 *
 * `/api/mobile/*` only re-serves data the web builds for its own pages
 * (`/user/reel`, `/user/interests`, ...), and middleware — which enforces role
 * and status for those pages — never runs on `/api`. So each route states the
 * same rule its page has, here, instead of trusting the app to only ask when
 * it should: a member account, and a live profile unless the page itself
 * allows an unfinished one.
 */
export async function requireMember(
  opts: { allowIncomplete?: boolean } = {},
): Promise<{ user: User; response: null } | { user: null; response: NextResponse }> {
  const { user, response } = await requireUser();
  if (!user) return { user: null, response };

  if (user.role !== "USER") {
    return {
      user: null,
      response: NextResponse.json(
        { error: "WRONG_ROLE", message: "Ye app sirf members ke liye hai." },
        { status: 403 },
      ),
    };
  }

  if (!opts.allowIncomplete && user.status !== "ACTIVE") {
    return {
      user: null,
      response: NextResponse.json(
        { error: "PROFILE_INCOMPLETE", message: "Pehle apni profile poori kijiye." },
        { status: 403 },
      ),
    };
  }

  return { user, response: null };
}
