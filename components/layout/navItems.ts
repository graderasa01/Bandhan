import {
  BadgeCheck,
  Bell,
  Bookmark,
  Bot,
  Brain,
  CalendarHeart,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  Film,
  Flame,
  Heart,
  Handshake,
  Home,
  KeyRound,
  LayoutGrid,
  MessageCircle,
  MessageSquareQuote,
  Orbit,
  Rocket,
  Search,
  Megaphone,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
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
  /**
   * Reachable, but not shown until the group is expanded.
   *
   * This is the mechanism behind §5's "the More experience must not show
   * nineteen equal-weight tiles at once". Nothing is deleted and no URL moves:
   * a secondary item is one row behind a "See all" tap, and search finds it
   * either way. What decides the flag is frequency — a page somebody opens most
   * days is primary; Kundli, Spotlight and App Setup are things you set up once
   * and come back to when you have a reason.
   */
  secondary?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  tone: NavTone;
  /** One line, shown under the group heading in the mobile hub. */
  hint?: string;
  items: NavItem[];
}

/**
 * Five spaces, not nineteen destinations.
 *
 * Every href below already existed; nothing was deleted and nothing moved to a
 * new URL. What changed is which space each one belongs to, and how much of
 * each space is visible before you ask for more.
 *
 *   TODAY      — what is happening now. The dashboard and the things waiting.
 *   DISCOVER   — every way to *find* someone, in one place: the Reel, search,
 *                the Circle, the daily question, and human help as the last
 *                option rather than a competing one.
 *   MY RISHTE  — the people. Matches, interests, shortlist, suggestions,
 *                messages, rooms. Stages of one journey, not six destinations.
 *   FAMILY     — a different *person* with their own portal, so not folded
 *                into "me".
 *   ME & TRUST — who I am and how ready I look: profile, verification, trust,
 *                intelligence, biodata, kundli, privacy, plan, services.
 *
 * **Grio is deliberately not a space.** It is on every `/user/*` screen already
 * as the floating assistant, and a permanent nav slot for something that is
 * always on screen spends one of five slots on a second door to the same room.
 * Its chat page (`/user/concierge`) stays reachable as a secondary row inside
 * ME & TRUST and is still found by nav search. The standalone Grio Map is no
 * longer a destination (2026-09-11): `/user/grio-map` redirects to the
 * dashboard so old bookmarks land somewhere useful, and nothing links to it.
 *
 * ME & TRUST opens on `/user/me`, a hub of short status rows — trust, plan,
 * kundli, biodata, privacy — so the dashboard can stay about *today* and the
 * profile view can stay about the profile. Every row there is a page that
 * already existed.
 *
 * Boost and Spotlight are secondary rows under ME & TRUST for the same reason
 * §5 gives: they are visibility *tools*, not places you live.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "today",
    label: "Today",
    tone: "gold",
    hint: "Aaj kya karna hai",
    items: [
      { href: "/user/dashboard", label: "Today", icon: Home, keywords: "dashboard home start aaj" },
      { href: "/user/inbox", label: "Inbox", icon: Bell, keywords: "aapke liye notices notifications pending", count: "inbox" },
    ],
  },
  {
    id: "discover",
    label: "Discover",
    tone: "info",
    hint: "Naye rishte dhoondhein",
    items: [
      { href: "/user/reel", label: "Reel", icon: Film, keywords: "rishta swipe discover browse naye" },
      { href: "/user/discover", label: "Search", icon: Search, keywords: "advanced search filters strict flexible behaviour learning khoj" },
      { href: "/user/circle", label: "Circle", icon: CalendarHeart, keywords: "serious live event budhwaar ravivaar" },
      { href: "/user/vibe", label: "Vibe", icon: Flame, keywords: "poll daily question soch board roz ka sawaal" },
      {
        href: "/partners",
        label: "Get Help",
        icon: Store,
        keywords: "marketplace pandit bureau rishta consultant madad service booking hire partner",
        // Human help is a real option and a paid one, so it sits inside the
        // space where somebody is already looking for people — one tap in,
        // never competing with the free ways to look.
        secondary: true,
      },
    ],
  },
  {
    id: "rishte",
    label: "My Rishte",
    tone: "wine",
    hint: "Aapke chal rahe rishte",
    items: [
      { href: "/user/matches", label: "Matches", icon: Heart, keywords: "my rishte mutual journey stage room", count: "matches" },
      { href: "/user/messages", label: "Messages", icon: MessageCircle, keywords: "chat baat", count: "messages" },
      { href: "/user/interests", label: "Interests", icon: Send, keywords: "received sent bheja", count: "interests" },
      { href: "/user/shortlist", label: "Shortlist", icon: Bookmark, keywords: "meri saved bookmark" },
      {
        href: "/user/proposals",
        label: "Suggestions",
        icon: MessageSquareQuote,
        keywords: "partner suggestion proposal rishta bheja wajah accept reject matchmaker",
        secondary: true,
      },
    ],
  },
  {
    id: "family",
    label: "Family",
    tone: "gold",
    hint: "Ghar walon ke saath",
    items: [
      { href: "/user/family", label: "Family", icon: Users, keywords: "circle parents blessing ghar wale ummeed expectations" },
      {
        href: "/user/managed-drafts",
        label: "Family Drafts",
        icon: ClipboardList,
        keywords: "bete beti ke liye profile banayein draft claim link ghar wale ki profile",
      },
    ],
  },
  {
    id: "me",
    label: "Me & Trust",
    tone: "trust",
    hint: "Aapki profile aur bharosa",
    items: [
      // The space's own front door: status rows for everything below, so the
      // rail's "Me" slot lands on one calm screen rather than a raw profile.
      { href: "/user/me", label: "Me & Trust", icon: LayoutGrid, keywords: "me hub trust plan kundli biodata privacy settings meri jagah" },
      // Profile editing lives outside UserShell — see app/(onboarding).
      { href: "/profile/build", label: "Edit Profile", icon: UserIcon, keywords: "my banayen photos fill details" },
      { href: "/user/profile/me", label: "View Profile", icon: Eye, keywords: "meri dekhein preview how it looks" },
      { href: "/user/profile-trust-score", label: "Trust Score", icon: ShieldCheck, keywords: "verification verified badge readiness bharosa", secondary: true },
      { href: "/user/verification", label: "Verification", icon: BadgeCheck, keywords: "verification badge identity pehchaan check proof document interview request kya check hua" },
      { href: "/user/subscription", label: "Plan", icon: CreditCard, keywords: "subscription premium pricing upgrade payment billing" },
      {
        href: "/user/profile/access",
        label: "Profile Access",
        icon: KeyRound,
        keywords: "permission delegate partner family helper revoke consent privacy kaun dekh sakta hai",
        secondary: true,
      },
      {
        href: "/user/verify-contact",
        label: "Verify Contact",
        icon: Smartphone,
        keywords: "mobile email otp verification",
        secondary: true,
      },
      {
        href: "/user/profile/intelligence",
        label: "Intelligence",
        icon: Brain,
        keywords: "marriage intelligence samajh layers sawaal children money family life values preferences",
        secondary: true,
      },
      { href: "/user/deep-profile", label: "Deep Profile", icon: Sparkles, keywords: "dimensions compatibility report", secondary: true },
      { href: "/user/biodata", label: "Biodata", icon: FileText, keywords: "pdf download share", secondary: true },
      { href: "/user/kundli", label: "Kundli", icon: Orbit, keywords: "kundali horoscope guna milan rashi nakshatra janam patri", secondary: true },
      { href: "/user/boost", label: "Boost", icon: Rocket, keywords: "profile visibility ranking top", secondary: true },
      { href: "/user/spotlight", label: "Spotlight", icon: Megaphone, keywords: "campaign promote reach visibility paid audience city", secondary: true },
      {
        href: "/user/services",
        label: "My Services",
        icon: Handshake,
        keywords: "partner booking service purchase intro call shortlist refund review",
        secondary: true,
      },
      {
        href: "/user/app-setup",
        label: "App Setup",
        icon: Smartphone,
        keywords: "install home screen pin lock quick login password nahi privacy settings",
        secondary: true,
      },
      // Grio's chat page. Secondary, not absent: the assistant itself floats on
      // every screen, so this is for the person who wants the full chat window
      // — not a sixth space competing with the five.
      { href: "/user/concierge", label: "Grio", icon: Bot, keywords: "ai assistant concierge help sawaal poochho chat", secondary: true },
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
 * The mobile rail: **one slot per space**, in the order of the day.
 *
 * Fixed, deliberately — an adaptive rail that reshuffles by what's "relevant
 * today" breaks the position memory that makes a rail faster than a menu in the
 * first place.
 *
 * It used to be Today / Reel / Matches / Grio / Profile, which is four of the
 * five spaces plus the assistant, and left Family and Discover-as-a-whole
 * behind the More sheet. Reel keeps its place in spirit: it is the first thing
 * inside Discover, so the daily loop is still one tap.
 */
export const BOTTOM_RAIL_HREFS = [
  "/user/dashboard",
  "/user/reel",
  "/user/matches",
  "/user/family",
  "/user/me",
];

/** What each rail slot is called, since the space is wider than the page. */
const RAIL_LABELS: Record<string, string> = {
  "/user/dashboard": "Today",
  "/user/reel": "Discover",
  "/user/matches": "Rishte",
  "/user/family": "Family",
  "/user/me": "Me",
};

export const BOTTOM_RAIL: NavItem[] = BOTTOM_RAIL_HREFS.map((href) => {
  const item = NAV_ITEMS.find((i) => i.href === href)!;
  return { ...item, label: RAIL_LABELS[href] ?? item.label };
});

export function navSearch(query: string): NavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return NAV_ITEMS.filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q));
}

export function isNavActive(pathname: string | null, href: string): boolean {
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}
