import {
  Bell,
  Bookmark,
  Bot,
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
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User as UserIcon,
  Users,
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

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "find",
    label: "Find",
    tone: "gold",
    items: [
      { href: "/user/dashboard", label: "Home", icon: Home, keywords: "dashboard start" },
      { href: "/user/reel", label: "Reel", icon: Film, keywords: "rishta swipe discover browse" },
      { href: "/user/matches", label: "Matches", icon: Heart, keywords: "mutual", count: "matches" },
      { href: "/user/shortlist", label: "Shortlist", icon: Bookmark, keywords: "meri saved bookmark" },
      { href: "/user/interests", label: "Interests", icon: Send, keywords: "received sent", count: "interests" },
      { href: "/user/circle", label: "Circle", icon: CalendarHeart, keywords: "serious live event" },
      { href: "/user/vibe", label: "Vibe", icon: Flame, keywords: "poll daily question soch board" },
    ],
  },
  {
    id: "talk",
    label: "Talk",
    tone: "info",
    items: [
      { href: "/user/messages", label: "Messages", icon: MessageCircle, keywords: "chat baat", count: "messages" },
      { href: "/user/inbox", label: "Inbox", icon: Bell, keywords: "aapke liye notices notifications", count: "inbox" },
      { href: "/user/concierge", label: "Grio", icon: Bot, keywords: "ai assistant concierge help" },
      { href: "/user/family", label: "Family", icon: Users, keywords: "circle parents blessing" },
    ],
  },
  {
    id: "profile",
    label: "My profile",
    tone: "trust",
    items: [
      // Profile editing lives outside UserShell — see app/(onboarding).
      { href: "/profile/build", label: "Edit Profile", icon: UserIcon, keywords: "my banayen photos fill" },
      { href: "/user/profile/me", label: "View Profile", icon: Eye, keywords: "meri dekhein preview how it looks" },
      { href: "/user/biodata", label: "Biodata", icon: FileText, keywords: "pdf download share" },
      { href: "/user/deep-profile", label: "Deep Profile", icon: Sparkles, keywords: "dimensions compatibility report" },
      { href: "/user/profile-trust-score", label: "Trust Score", icon: ShieldCheck, keywords: "verification verified badge" },
      { href: "/user/kundli", label: "Kundli", icon: Orbit, keywords: "kundali horoscope guna milan rashi nakshatra janam patri" },
      {
        href: "/user/app-setup",
        label: "App Setup",
        icon: Smartphone,
        keywords: "install home screen pin lock screen quick login password nahi",
      },
    ],
  },
  {
    id: "upgrade",
    label: "Upgrade",
    tone: "wine",
    items: [
      { href: "/user/boost", label: "Boost", icon: Rocket, keywords: "profile visibility ranking top" },
      { href: "/user/subscription", label: "Plan", icon: CreditCard, keywords: "subscription premium pricing upgrade payment billing" },
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
 * than a menu in the first place. Vibe holds the fourth slot over Interests
 * (Devesh, 2026-08-02): a daily poll only becomes a habit at one tap away,
 * while Interests overlaps with Matches and is one tap deeper in the hub.
 */
export const BOTTOM_RAIL_HREFS = ["/user/dashboard", "/user/reel", "/user/vibe", "/user/matches"];

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
