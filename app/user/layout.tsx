import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isPinUnlocked } from "@/lib/auth/pin";
import { canUseGrioVoice } from "@/lib/services/plans/entitlements";
import GrioProvider from "@/components/grio/GrioProvider";
import GrioBubble from "@/components/grio/GrioBubble";
import GrioOverlay from "@/components/grio/GrioOverlay";
import InstallAppPrompt from "@/components/pwa/InstallAppPrompt";
import SessionKeepAlive from "@/components/auth/SessionKeepAlive";

/**
 * Shared across every /user/* page (unlike UserShell, which each page
 * re-renders individually) so Grio's open/scope state survives normal
 * navigation instead of resetting on every route change.
 *
 * Each page still does its own `getCurrentUser` + redirect for its auth gate
 * — this second call is cache()-deduped (see lib/auth/session.ts) so it costs
 * no extra DB round trip. An unauthenticated visit just renders children with
 * no Grio chrome; the page's own redirect takes over from there.
 *
 * Also the quick-unlock PIN gate — see below.
 */
export default async function UserLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  /**
   * The household-privacy curtain (lib/auth/pin.ts).
   *
   * A `redirect`, not a "render the lock instead of `children`" early return.
   * The early return looks identical on screen and still leaks: Next.js runs
   * this layout and the page segment concurrently, so the page's
   * server-rendered output ends up in the RSC flight payload of the very same
   * 200 HTML document the browser then parses. Redirecting moves that payload
   * into a 307 body the browser throws away. app/lock/page.tsx documents both
   * the measurement and the residue this still leaves.
   *
   * Placed here rather than in middleware because the answer needs
   * `User.pinHash` from the DB, and middleware runs on the Edge where Prisma
   * doesn't (see middleware.ts's own note). The user is already loaded above,
   * so a no-PIN account — the default, and most accounts — costs nothing:
   * `isPinUnlocked` short-circuits before it even reads a cookie.
   */
  if (!(await isPinUnlocked(user.id, user.pinHash ? user.pinSetAt : null))) {
    redirect("/lock");
  }

  // Resolved here rather than inside the chat: this layout already has the
  // user, the answer can't change mid-session, and it saves every panel open a
  // round trip for one boolean.
  const voiceEnabled = await canUseGrioVoice(user.id);

  return (
    <GrioProvider voiceEnabled={voiceEnabled}>
      {children}
      <GrioBubble />
      <GrioOverlay />
      {/* Sits here rather than in a page so the install nudge's timer is not
          restarted by every navigation — and so it only ever reaches members. */}
      <InstallAppPrompt />
      <SessionKeepAlive />
    </GrioProvider>
  );
}
