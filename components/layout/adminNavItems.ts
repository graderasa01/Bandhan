import {
  Banknote,
  BellRing,
  Coins,
  Handshake,
  Gift,
  Headset,
  IndianRupee,
  LayoutDashboard,
  Megaphone,
  Mic,
  MessageCircleQuestion,
  Palette,
  Receipt,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  ToggleRight,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The single source of truth for "where can an admin go".
 *
 * This mirrors `navItems.ts` on purpose — the user side already learned that a
 * flat array living inside a Shell drifts the moment more than one surface
 * renders it. AdminShell used to hold a flat eleven-item list and render it
 * twice: once as a sidebar, once as a *twelve-icon mobile bar*, which gave each
 * destination roughly 31px of width. Grouping the items and giving the phone a
 * four-item rail plus a sheet is what fixes that, and it only stays fixed if
 * both surfaces read the same file.
 *
 * Groups here are by *what the admin is doing*, not by which model the page
 * touches: a queue you clear, money you watch, a switch you flip, a record you
 * read. That is the distinction that decides which page someone wants at 11pm.
 */

export type AdminNavTone = "gold" | "wine" | "trust" | "info";

export const ADMIN_TONE_CLASSES: Record<AdminNavTone, string> = {
  gold: "bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300",
  wine: "bg-wine-100 text-wine-700 dark:bg-wine-900/30 dark:text-wine-300",
  trust: "bg-trust/15 text-trust",
  info: "bg-info-bg text-info",
};

/**
 * Keys of `/api/admin/counts`. Every one of these means *a human is blocked
 * until an admin acts* — the same bar the user-side badges hold. Deliberately
 * absent: total users, revenue, audit rows. Those are numbers to look at, not
 * work to clear, and badging them would leave every badge permanently lit.
 */
export type AdminCountKey =
  | "verification"
  | "moderation"
  | "partners"
  | "matchmaker"
  | "voiceAccess";

export interface AdminNavItem {
  href: string;
  /** Short English label — nav chrome stays English even though body copy is Hinglish. */
  label: string;
  icon: LucideIcon;
  /** One line, shown on the Control Center tiles and the More sheet. Hinglish, like all body copy. */
  blurb: string;
  /** Extra search terms, never rendered. Carries the Hinglish words an admin actually types. */
  keywords?: string;
  count?: AdminCountKey;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  tone: AdminNavTone;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    tone: "gold",
    items: [
      {
        href: "/admin",
        label: "Control Center",
        icon: LayoutDashboard,
        blurb: "Kahan kaam ruka hai, ek nazar mein.",
        keywords: "home dashboard start overview",
      },
      {
        href: "/admin/growth",
        label: "Growth",
        icon: TrendingUp,
        blurb: "Funnel, retention, gate pressure aur paisa.",
        keywords: "analytics funnel retention cohort conversion revenue mrr arpu growth analyst",
      },
      {
        href: "/admin/lifecycle",
        label: "Lifecycle",
        icon: BellRing,
        blurb: "Kaunse nudge jaayenge — bhejne se pehle padh lijiye.",
        keywords: "nudge notification push campaign reminder retention wapas bulao dry run",
      },
      {
        href: "/admin/messages",
        label: "Messages",
        icon: Megaphone,
        blurb: "Offer ya announcement — app, email ya WhatsApp par.",
        keywords: "offer announcement broadcast message notice partner note whatsapp email push special",
      },
    ],
  },
  {
    id: "queues",
    label: "Queues",
    tone: "wine",
    items: [
      {
        href: "/admin/verification",
        label: "Verification",
        icon: ShieldCheck,
        blurb: "Photo review aur verification ke rules.",
        keywords: "photo review approve reject badge verified",
        count: "verification",
      },
      {
        href: "/admin/moderation",
        label: "Moderation",
        icon: ShieldAlert,
        blurb: "Rukki hui recordings, sawaal aur user reports.",
        keywords: "reports voice notes questions abuse flag safety",
        count: "moderation",
      },
      {
        href: "/admin/partners",
        label: "Partners",
        icon: Handshake,
        blurb: "Partner applications approve ya reject karein.",
        keywords: "agent broker application approve pending",
        count: "partners",
      },
      {
        href: "/admin/matchmaker",
        label: "Matchmaker",
        icon: Headset,
        blurb: "Assisted matchmaking ki requests.",
        keywords: "assisted requests premium concierge",
        count: "matchmaker",
      },
      {
        href: "/admin/voice-access",
        label: "Voice Access",
        icon: Mic,
        blurb: "Self-fill voice ki exception requests.",
        keywords: "self fill sarvam speech accessibility exception",
        count: "voiceAccess",
      },
    ],
  },
  {
    id: "people",
    label: "People",
    tone: "trust",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: Users,
        blurb: "Har account dhoondein, dekhein, suspend karein.",
        keywords: "accounts search suspend block reactivate member khaata",
      },
      {
        href: "/admin/admins",
        label: "Admin Accounts",
        icon: ShieldPlus,
        blurb: "Naye admin ya support account banayein.",
        keywords: "create admin support team access panel login",
      },
    ],
  },
  {
    id: "money",
    label: "Money",
    tone: "gold",
    items: [
      {
        href: "/admin/payments",
        label: "Payments",
        icon: Receipt,
        blurb: "Har payment, subscription aur revenue.",
        keywords: "revenue transactions ledger razorpay refund paisa kamai",
      },
      {
        href: "/admin/pricing",
        label: "Pricing",
        icon: IndianRupee,
        blurb: "Plan ke daam aur commission rate.",
        keywords: "plans price paise commission rate daam",
      },
      {
        href: "/admin/items",
        label: "Items",
        icon: Gift,
        blurb: "Ek baar bikne wali cheezein — daam aur wording.",
        keywords: "item one-time purchase spotlight discovery week daam alag",
      },
      {
        href: "/admin/service-bookings",
        label: "Services",
        icon: Handshake,
        blurb: "Partner bookings, complaints, listing approval aur reviews.",
        keywords: "marketplace booking dispute refund listing approve review partner service shikayat",
      },
      {
        href: "/admin/commissions",
        label: "Commissions",
        icon: Coins,
        blurb: "Partner commissions approve aur pay karein.",
        keywords: "payout partner earnings approve paid",
      },
      {
        href: "/admin/payouts",
        label: "Payouts",
        icon: Banknote,
        blurb: "Bank details verify karein, withdrawal bhejein, UTR daalein.",
        keywords: "payout withdraw bank upi utr transfer paisa bhejo account verify",
      },
    ],
  },
  {
    id: "configure",
    label: "Configure",
    tone: "info",
    items: [
      {
        href: "/admin/features",
        label: "Features & Access",
        icon: ToggleRight,
        blurb: "Feature flags aur per-user entitlement overrides.",
        keywords: "flags rollout entitlement override access unlock",
      },
      {
        href: "/admin/ai-settings",
        label: "AI Settings",
        icon: Sparkles,
        blurb: "Har AI feature ka provider aur model.",
        keywords: "claude openai gemini deepseek provider model prompt",
      },
      {
        href: "/admin/polls",
        label: "Mindset Sawaal",
        icon: MessageCircleQuestion,
        blurb: "Vibe Hub ke daily poll ke sawaal.",
        keywords: "poll vibe arena question theme daily sawal",
      },
      {
        href: "/admin/theme",
        label: "Theme",
        icon: Palette,
        blurb: "Poore site ka colour, bina redeploy ke.",
        keywords: "colour color pack kundan raat kaagaz brand rang",
      },
    ],
  },
  {
    id: "records",
    label: "Records",
    tone: "trust",
    items: [
      {
        href: "/admin/audit-logs",
        label: "Audit Log",
        icon: ScrollText,
        blurb: "Kisne kya badla — har admin action ka record.",
        keywords: "history trail who changed what log record",
      },
    ],
  },
];

/** Flat view, for lookups and search. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

/** Tone lookup by href, so a flat render can still colour by group. */
export const ADMIN_TONE_BY_HREF: Record<string, AdminNavTone> = Object.fromEntries(
  ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.href, g.tone] as const)),
);

/**
 * The mobile rail. Four, fixed — the old bar carried all twelve destinations
 * and was unusable on any real phone. These are the ones an admin opens daily;
 * everything else is one tap away in the More sheet.
 */
export const ADMIN_RAIL_HREFS = [
  "/admin",
  "/admin/verification",
  "/admin/moderation",
  "/admin/partners",
];

export const ADMIN_RAIL: AdminNavItem[] = ADMIN_RAIL_HREFS.map(
  (href) => ADMIN_NAV_ITEMS.find((i) => i.href === href)!,
);

export function adminNavSearch(query: string): AdminNavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ADMIN_NAV_ITEMS.filter((i) =>
    `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q),
  );
}

/**
 * `/admin` is exact-match only. Every other admin page starts with `/admin`, so
 * the prefix rule the user-side nav uses would light the Control Center up on
 * all of them.
 */
export function isAdminNavActive(pathname: string | null, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}
