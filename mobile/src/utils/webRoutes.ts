/**
 * The server speaks in web paths — a notice's `href`, a reel notice's CTA,
 * Grio's action buttons. This turns them into the app's own screens, so a
 * notice written once by `createNotice()` opens the right place on both —
 * and Grio's catalog `href`s are translated here too (features/grio/engine/
 * actionPolicy.ts), so a catalog button opens the same screen a notice would.
 * Anything the app has no screen for opens on the website instead.
 */
export type AppTarget = { kind: "app"; route: string } | { kind: "web"; path: string };

const EXACT: Record<string, string> = {
  "/user/dashboard": "/home",
  "/user/reel": "/reels",
  "/user/discover": "/search",
  "/user/interests": "/interests",
  "/user/matches": "/interests?tab=matches",
  "/user/shortlist": "/interests?tab=shortlist",
  "/user/messages": "/chats",
  "/user/inbox": "/notifications",
  "/user/me": "/me",
  "/user/profile/me": "/me/preview",
  "/user/profile-setup": "/setup",
  // The editor of a profile that exists — the app's full form.
  "/profile/build": "/setup",
  // Where an unfinished profile gets finished, as on the web: Bolo (a live
  // member landing there is sent home by Bolo itself).
  "/bolo": "/bolo",
  "/user/concierge": "/grio",
  "/user/kundli": "/kundli",
  "/user/app-setup": "/settings",
};

export function appTargetFor(href: string | null | undefined): AppTarget | null {
  if (!href) return null;
  const [pathname] = href.split("?");
  const path = (pathname ?? "").replace(/\/+$/, "") || "/";

  const exact = EXACT[path];
  if (exact) return { kind: "app", route: exact };

  const thread = path.match(/^\/user\/messages\/([^/]+)$/);
  if (thread) return { kind: "app", route: `/chat/${thread[1]}` };

  const profile = path.match(/^\/user\/profile\/([^/]+)$/);
  if (profile) return { kind: "app", route: `/profile/${profile[1]}` };

  return path.startsWith("/") ? { kind: "web", path: href } : null;
}
