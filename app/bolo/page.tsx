import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getProviderKey } from "@/lib/ai/credentials";
import { getCurrentUser, sessionClaimsStale } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/landingPath";
import { postLoginPathWithNext } from "@/lib/auth/postLoginPath";
import { otpChannelStatus } from "@/lib/services/auth/contactOtpService";
import { loadBoloMember } from "@/lib/services/bolo/completeService";
import { getRollout, resolveAccess } from "@/lib/services/flags/featureFlagService";
import AppBackground from "@/components/theme/AppBackground";
import BoloExperience from "@/components/bolo/BoloExperience";

export const metadata: Metadata = {
  title: "Bol kar profile banayein — BandhanTak",
  description: "Grio se baat kijiye, 2 minute me shaadi ki profile taiyaar — bina lambe form ke.",
};

/**
 * The one page that commits to night whatever the site theme says (see
 * `.bolo-night`, globals.css), so the browser's own chrome is told the same
 * thing — an ivory status bar over a lamp-lit room is the seam everyone sees.
 */
export const viewport: Viewport = {
  themeColor: "#16203f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Reads the session cookie and the admin's live settings, so it can't be
// prerendered.
export const dynamic = "force-dynamic";

/**
 * The spoken front door — and the one place an unfinished profile gets
 * finished.
 *
 *   - No session: a visitor. Profile first, then a number and a code (or,
 *     where no code can reach the number, a password of their own), then the
 *     account. This is where the landing page's "Bol kar profile banayein"
 *     lands.
 *   - A USER still INCOMPLETE: a member. They registered, signed in with
 *     Google or a code, or saved a draft halfway — every one of those lands
 *     here (`landingPathForRole`). Grio starts from what the profile already
 *     holds and asks only the rest; no number, no code, no second account.
 *   - Anyone else signed in has a home of their own and is sent there.
 *
 * No shell, not even `FocusShell`: the page draws its own one-line header
 * (`BoloHeader`) because that header carries the profile's progress, and a
 * sticky bar over a two-minute conversation is room the question needs. The
 * marketing header's Login / Register buttons stay out for the same reason as
 * before — they are the two things this page exists to make unnecessary.
 *
 * The canvas island is kept for its tokens (the serif, the gold). The material
 * comes from `.glass-theme` — the measured glass system (globals.css, "THE
 * GLASS MATERIAL SYSTEM") — and `.bolo-night` restates the page's own tokens on
 * top of it, so every shared component rendered inside (Button, Input, Sheet,
 * ProfileFillCard, ContactStep) lands in the same room without knowing it is in
 * one. This page is that room whichever way the site's light/dark toggle is
 * set. The background is rendered here rather than inside `BoloExperience` so
 * the room is already lit during the client component's first, unhydrated
 * frame.
 *
 * `/bolo` is the proof page for the glass system: it is the only route on it
 * today, on purpose. Everything else moves over a screen at a time once this
 * one is signed off.
 */
export default async function BoloPage({
  searchParams,
}: {
  /** `?next=` — the page middleware was bouncing this member off when it sent them here. */
  searchParams?: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user && !(user.role === "USER" && user.status === "INCOMPLETE")) {
    const next = safeNextPath((searchParams ? await searchParams : {}).next);
    // Middleware sends members here off the status in their cookie, which is
    // copied from the row only when the cookie is signed. If the row has moved
    // on since (the dashboard's own render made the profile live, and a page
    // cannot re-sign a cookie), sending them home keeps that cookie, and every
    // tap on the reel comes straight back here and home again. So the cookie is
    // re-signed first, by the one kind of handler allowed to, and the member
    // goes on to the page they asked for.
    if (await sessionClaimsStale(user)) {
      redirect(next ? `/api/auth/session/refresh?next=${encodeURIComponent(next)}` : "/api/auth/session/refresh");
    }
    redirect(await postLoginPathWithNext(user, next));
  }

  const [member, geminiKey, rollout] = await Promise.all([
    user ? loadBoloMember(user) : Promise.resolve(null),
    getProviderKey("GEMINI"),
    getRollout("voiceOnboarding"),
  ]);
  const voiceAvailable = Boolean(geminiKey) && resolveAccess(rollout, false) !== "closed";

  return (
    // `isolate`, not just `relative`: the room paints at `z-index: -1`, and
    // without a stacking context here it would sink behind the document's own
    // background and vanish.
    //
    // No `glass-stack-enter` here: `app/template.tsx` already animates every
    // route, and two transforms on one navigation is a doubled move rather
    // than a better one. The stacked-card transition is defined and ready in
    // globals.css ("Page transition — one physical glass card laid over the
    // last"); the page that proves it today is this one's own question deck,
    // where a card really does come up over the one before it.
    <div className="glass-theme bt-glass bolo-night bt-canvas bt-canvas--dense dark relative isolate min-h-dvh">
      <AppBackground />
      <BoloExperience channels={otpChannelStatus()} voiceAvailable={voiceAvailable} member={member} />
    </div>
  );
}
