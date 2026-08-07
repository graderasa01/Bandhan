import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { canUseGrioVoice } from "@/lib/services/plans/entitlements";
import GrioProvider from "@/components/grio/GrioProvider";
import GrioBubble from "@/components/grio/GrioBubble";
import GrioOverlay from "@/components/grio/GrioOverlay";

/**
 * Shared across every /user/* page (unlike UserShell, which each page
 * re-renders individually) so Grio's open/scope state survives normal
 * navigation instead of resetting on every route change.
 *
 * Each page still does its own `getCurrentUser` + redirect for its auth gate
 * — this second call is cache()-deduped (see lib/auth/session.ts) so it costs
 * no extra DB round trip. An unauthenticated visit just renders children with
 * no Grio chrome; the page's own redirect takes over from there.
 */
export default async function UserLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  // Resolved here rather than inside the chat: this layout already has the
  // user, the answer can't change mid-session, and it saves every panel open a
  // round trip for one boolean.
  const voiceEnabled = await canUseGrioVoice(user.id);

  return (
    <GrioProvider voiceEnabled={voiceEnabled}>
      {children}
      <GrioBubble />
      <GrioOverlay />
    </GrioProvider>
  );
}
