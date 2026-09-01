/**
 * The origin used to build links that LEAVE the app — a referral link a
 * partner pastes into WhatsApp, an invite URL in an email, a QR code printed
 * on a card.
 *
 * ## Why not the request's own host
 *
 * `/partner/referral-tools` used to read `headers().get("host")`, which is
 * correct for a link the browser follows itself and wrong for every link here:
 * a partner opening the page on `localhost:3000` got a referral link pointing
 * at `localhost:3000`, and a partner reaching a Railway preview host got a
 * link to that preview. Those links are meant to be shared with people on
 * other machines, so the host that happened to serve the page is not the host
 * they should point at.
 *
 * Password reset is the deliberate exception and still uses the request origin
 * — see `passwordResetService`. A reset link is followed by the same person on
 * the same host, and pinning it to a configured origin is how a reset mail
 * sends someone from a staging host to production.
 *
 * ## The fallback
 *
 * Falls through to the real domain rather than throwing: a missing env var
 * should send people to bandhantak.com, not break the page that renders the
 * link. Trailing slash is stripped so callers can always write `${origin}/r/x`.
 */
export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "https://bandhantak.com"
  ).replace(/\/$/, "");
}
