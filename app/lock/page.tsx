import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isPinUnlocked, pinLockSecondsRemaining } from "@/lib/auth/pin";
import PinLockScreen from "@/components/auth/PinLockScreen";

/**
 * The quick-unlock lock screen, deliberately living OUTSIDE `/user/*`.
 *
 * The obvious build is to render the lock from `app/user/layout.tsx` in place
 * of `children`, and it looks right in a browser. It is the wrong build.
 * Next.js renders a layout and its page segment concurrently, so the page
 * still executes and its server-rendered subtree still lands in the RSC
 * flight payload of the same response — even when the layout never renders
 * `children`. Measured here, not assumed: with the lock "showing", the
 * /user/dashboard response still carried the real trust score (85, "STRONG")
 * and the rest of the server-rendered dashboard inside a <script> tag, in a
 * 200 HTML document the browser parses and View Source displays. For a
 * feature whose whole promise is "whoever else is holding my phone can't see
 * this", that is not cosmetic.
 *
 * Redirecting instead moves that payload into the body of a 307, which
 * browsers discard without parsing — nothing reaches the DOM, View Source
 * follows the hop, and what actually renders is this page, which holds no
 * member data at all. Worth being precise about the residue: the redirect
 * does *not* stop Next from serialising the page (verified against a
 * production build, not just dev). Reading it back requires a scripted HTTP
 * client with redirects disabled plus the httpOnly session cookie — i.e. a
 * fully compromised session, which is the boundary this feature explicitly
 * does not claim to defend (see lib/auth/pin.ts). Closing it completely would
 * mean gating in middleware, which cannot reach `User.pinHash` on the Edge
 * without a second, staleness-prone "has PIN" cookie.
 *
 * All of which is why the lock screen has to be a route the /user layout does
 * not gate — /lock, not /user/lock.
 *
 * Not in ROUTE_ACCESS_MATRIX / middleware's matcher on purpose: this page has
 * to be reachable by exactly the accounts the matrix would bounce, and it
 * carries no data of its own. Its own `getCurrentUser()` below is the gate.
 */
export default async function LockPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // No PIN, or already unlocked — nothing to ask for. Sending them on rather
  // than showing a keypad they can't satisfy also closes the loop after a
  // successful verify.
  if (!user.pinHash || (await isPinUnlocked(user.id, user.pinSetAt))) {
    redirect("/user/dashboard");
  }

  return (
    <PinLockScreen
      userName={user.fullName}
      initialLockedSeconds={pinLockSecondsRemaining(user.pinLockedUntil)}
    />
  );
}
