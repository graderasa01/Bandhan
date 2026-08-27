import {
  Bell,
  Bookmark,
  Bot,
  Brain,
  CalendarHeart,
  CreditCard,
  Eye,
  FileText,
  Film,
  Flame,
  Heart,
  Home,
  MessageCircle,
  Orbit,
  Rocket,
  Search,
  Megaphone,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User as UserIcon,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

/**
 * The single source of truth for "where can a user go".
 *
 * This used to be a flat 19-item array living inside UserShell, which meant the
 * three surfaces that render it (desktop sidebar, mobile More sheet, the site
 * map on the profile "live" screen) each re-implemented their own layout and
 * quietly drifted — the sheet, which carried fifteen of the nineteen items,
 * ended up as the only one with no icons at all. `NavHub` now renders all three
 * from this file, so adding a page here makes it appear everywhere at once.
 */

/**
 * Kinds of tone, not a fourth CTA colour — D-26 still holds for buttons
 * (gold + mehroon, nothing else). These are the same non-action semantic
 * tokens `Card`'s `trust`/`info` variants already use elsewhere.
 *
 * Tone is a property of the *group*, not the item: a shared colour is what
 * makes a group read as a group at a glance, which is the entire reason the
 * flat list was broken up.
 */
export type NavTone = "gold" | "wine" | "trust" | "info";

export const NAV_TONE_CLASSES: Record<NavTone, string> = {
  gold: "bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300",
  wine: "bg-wine-100 text-wine-700 dark:bg-wine-900/30 dark:text-wine-300",
  trust: "bg-trust/15 text-trust",
  info: "bg-info-bg text-info",
};

/** Keys of `/api/nav/counts` — only things that mean "someone is waiting on you". */
export type NavCountKey = "matches" | "interests" | "messages" | "inbox";

export interface NavItem {
  href: string;
  /** Short English label. Nav chrome stays English even though body copy is Hinglish. */
  label: string;
  icon: LucideIcon;
  /**
   * Extra search terms, never rendered. Carries the Hinglish names users
   * actually think in ("kundali", "meri shortlist") and sub-pages that don't
   * deserve their own tile ("report", "preview"), so typing either still lands.
   */
  keywords?: string;
  count?: NavCountKey;
}

export interface NavGroup {
  id: string;
  label: string;
  tone: NavTone;
  items: NavItem[];
}

/**
 * Four spaces, not nineteen destinations.
 *
 * Every href below already existed; nothing was deleted and nothing moved to a
 * new URL. What changed is the grouping, because the old one — Find / Talk /
 * My profile / Upgrade — was organised around *what the app does* rather than
 * what a person is trying to do. "Matches" and "Messages" sat in different
 * groups even though they are the same rishta two days apart.
 *
 * The four spaces are the mental model the product direction settled on:
 *
 *   TODAY   — what is happening now: today's rishtey, the daily question, the
 *             Circle, and whatever is waiting.
 *   RISHTE  — the people. Interests, shortlist, matches, chats — one space,
 *             because they are stages of one thing.
 *   GRIO    — the assistant. Its own space because it is reachable from
 *             everywhere and belongs to no other.
 *   ME      — who I am and how ready I look: profile, trust, intelligence,
 *             biodata, kundli, plan.
 *
 * FAMILY stays a fifth space rather than folding into ME, because a family
 * member is a different *person* with their own portal — filing that under
 * "me" would misdescribe it.
 *
 * Boost and Plan moved inside ME rather than keeping their own "Upgrade"
 * group. Selling gets a place, not a heading — the same judgement the priority
 * engine makes by putting P8_UPGRADE beneath every real thing.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "today",
    label: "Today",
    tone: "gold",
    items: [
      { href: "/user/dashboard", label: "Today", icon: Home, keywords: "dashboard home start aaj" },
      { href: "/user/reel", label: "Reel", icon: Film, keywords: "rishta swipe discover browse naye" },
      { href: "/user/discover", label: "Discover", icon: Search, keywords: "advanced search filters strict flexible behaviour learning" },
      { href: "/user/vibe", label: "Vibe", icon: Flame, keywords: "poll daily question soch board roz ka sawaal" },
      { href: "/user/circle", label: "Circle", icon: CalendarHeart, keywords: "serious live event" },
      { href: "/user/inbox", label: "Inbox", icon: Bell, keywords: "aapke liye notices notifications pending", count: "inbox" },
    ],
  },
  {
    id: "rishte",
    label: "Rishte",
    tone: "info",
    items: [
      { href: "/user/matches", label: "My Rishte", icon: Heart, keywords: "matches mutual journey stage", count: "matches" },
      { href: "/user/messages", label: "Messages", icon: MessageCircle, keywords: "chat baat", count: "messages" },
      { href: "/user/interests", label: "Interests", icon: Send, keywords: "received sent", count: "interests" },
      { href: "/user/shortlist", label: "Shortlist", icon: Bookmark, keywords: "meri saved bookmark" },
    ],
  },
  {
    id: "grio",
    label: "Grio",
    tone: "gold",
    items: [
      { href: "/user/concierge", label: "Grio", icon: Bot, keywords: "ai assistant concierge help sawaal poochho" },
      {
        href: "/user/grio-map",
        label: "Grio Map",
        icon: Waypoints,
        keywords: "samajh map poora app kahan hoon agla step privacy kya jaanta hai sitemap",
      },
    ],
  },
  {
    id: "me",
    label: "Me",
    tone: "trust",
    items: [
      // Profile editing lives outside UserShell — see app/(onboarding).
      { href: "/profile/build", label: "Edit Profile", icon: UserIcon, keywords: "my banayen photos fill" },
      { href: "/user/profile/me", label: "View Profile", icon: Eye, keywords: "meri dekhein preview how it looks" },
      {
        href: "/user/profile/intelligence",
        label: "Intelligence",
        icon: Brain,
        keywords: "marriage intelligence samajh layers sawaal children money family life values preferences",
      },
      { href: "/user/profile-trust-score", label: "Trust Score", icon: ShieldCheck, keywords: "verification verified badge readiness" },
      { href: "/user/verify-contact", label: "Verify Contact", icon: Smartphone, keywords: "mobile email otp verification" },
      { href: "/user/deep-profile", label: "Deep Profile", icon: Sparkles, keywords: "dimensions compatibility report" },
      { href: "/user/biodata", label: "Biodata", icon: FileText, keywords: "pdf download share" },
      { href: "/user/kundli", label: "Kundli", icon: Orbit, keywords: "kundali horoscope guna milan rashi nakshatra janam patri" },
      { href: "/user/boost", label: "Boost", icon: Rocket, keywords: "profile visibility ranking top" },
      { href: "/user/spotlight", label: "Spotlight", icon: Megaphone, keywords: "campaign promote reach visibility paid audience city" },
      { href: "/user/subscription", label: "Plan", icon: CreditCard, keywords: "subscription premium pricing upgrade payment billing" },
      {
        href: "/user/app-setup",
        label: "App Setup",
        icon: Smartphone,
        keywords: "install home screen pin lock screen quick login password nahi",
      },
    ],
  },
  {
    id: "family",
    label: "Family",
    tone: "wine",
    items: [
      { href: "/user/family", label: "Family", icon: Users, keywords: "circle parents blessing ghar wale ummeed" },
    ],
  },
];

/** Flat view, for lookups and search. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Tone lookup by href, so a flat render can still colour by group. */
export const NAV_TONE_BY_HREF: Record<string, NavTone> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.href, g.tone] as const)),
);

/**
 * The mobile rail. Fixed, deliberately — an adaptive rail that reshuffles by
 * what's "relevant today" breaks the position memory that makes a rail faster
 * than a menu in the first place.
 *
 * Five slots, one per space plus Reel. Grio earns a slot because it is now the
 * way most things get done rather than one feature among many; Reel keeps one
 * because it is the daily loop and a loop two taps deep stops being daily.
 *
 * **Vibe moved off the rail**, which reverses an explicit earlier call (Devesh,
 * 2026-08-02: "a daily poll only becomes a habit at one tap away"). The
 * reasoning still stands and the habit is preserved a different way: an
 * unanswered daily question now surfaces on Today as a P5 priority, so it is
 * one tap from the first screen on the days it matters rather than a permanent
 * slot on every day. If that turns out not to hold the habit, this is the line
 * to revert.
 */
export const BOTTOM_RAIL_HREFS = [
  "/user/dashboard",
  "/user/reel",
  "/user/matches",
  "/user/concierge",
  "/user/profile/me",
];

export const BOTTOM_RAIL: NavItem[] = BOTTOM_RAIL_HREFS.map(
  (href) => NAV_ITEMS.find((i) => i.href === href)!,
);

export function navSearch(query: string): NavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return NAV_ITEMS.filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q));
}

export function isNavActive(pathname: string | null, href: string): boolean {
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}
