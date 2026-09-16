import {
  BadgeIndianRupee,
  Briefcase,
  CalendarCheck,
  ClipboardList,
  DoorOpen,
  Home,
  MessageSquare,
  Send,
  Share2,
  ShieldCheck,
  Store,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * The single source of truth for "where can a partner go".
 *
 * D-90 Partner Journey: four spaces instead of six, so the mobile rail is the
 * whole map — Today · Families · Work · Earnings — and the few set-once pages
 * sit in the More sheet. Every old href is still here: nothing was deleted and
 * no URL moved. Only the grouping changed, and /partner/families was added.
 *
 *   TODAY     — the dashboard: the set-up checklist while it is unfinished,
 *               then what needs doing right now.
 *   FAMILIES  — every family this partner brought or is helping, one row each
 *               (/partner/families), plus the pages those stages live on:
 *               client drafts and desks, referral leads, invites.
 *   WORK      — the work itself: marketplace bookings, the enquiries that
 *               become bookings, the rishta rooms a client let this partner
 *               into, and the listing that brings the work in.
 *   EARNINGS  — the money: payouts first (balance, withdraw, statement), then
 *               the commission ledger behind them.
 *   MORE      — set once: the referral QR/link tools and contact verification.
 *
 * Labels are `t()` keys + English defaults. Nav chrome stays English (see the
 * member nav's note); the `en` dictionary carries the same strings so the
 * Hinglish/English toggle resolves them either way, and a missing key can
 * never blank a tab.
 */

export interface PartnerNavItem {
  href: string;
  /** Dictionary key under `layout.partnerShell.*`. */
  key: string;
  /** English default, rendered when the dictionary has no entry. */
  label: string;
  icon: LucideIcon;
  /**
   * Also treat these prefixes as "inside this item". `/partner/clients/new`
   * lives under Families even though it is its own row, so the group must not
   * light up twice.
   */
  exact?: boolean;
}

export interface PartnerNavGroup {
  id: "today" | "families" | "work" | "earnings" | "more";
  key: string;
  label: string;
  icon: LucideIcon;
  /** The row the group's rail slot opens; also the first sidebar row. */
  primary: PartnerNavItem;
  /** Sub-pages of the same space, shown under a small heading in the sidebar and as tabs on the page. */
  items: PartnerNavItem[];
  /** Shown in the mobile rail. Exactly four groups carry this; MORE opens a sheet. */
  rail: boolean;
}

export const PARTNER_NAV_GROUPS: PartnerNavGroup[] = [
  {
    id: "today",
    key: "layout.partnerShell.groupToday",
    label: "Today",
    icon: Home,
    primary: { href: "/partner/dashboard", key: "layout.partnerShell.navToday", label: "Today", icon: Home },
    items: [],
    rail: true,
  },
  {
    id: "families",
    key: "layout.partnerShell.groupFamilies",
    label: "Families",
    icon: Users,
    primary: { href: "/partner/families", key: "layout.partnerShell.navFamilies", label: "Families", icon: Users },
    items: [
      { href: "/partner/clients", key: "layout.partnerShell.navClients", label: "Clients", icon: ClipboardList },
      { href: "/partner/clients/new", key: "layout.partnerShell.navNewClient", label: "New client", icon: UserPlus },
      { href: "/partner/leads", key: "layout.partnerShell.navLeads", label: "Leads", icon: UserCheck },
      { href: "/partner/invite", key: "layout.partnerShell.navInvite", label: "Invite", icon: Send },
    ],
    rail: true,
  },
  {
    id: "work",
    key: "layout.partnerShell.groupWork",
    label: "Work",
    icon: Briefcase,
    primary: { href: "/partner/bookings", key: "layout.partnerShell.navBookings", label: "Bookings", icon: CalendarCheck },
    items: [
      { href: "/partner/enquiries", key: "layout.partnerShell.navEnquiries", label: "Enquiries", icon: MessageSquare },
      { href: "/partner/rooms", key: "layout.partnerShell.navRooms", label: "Rishte", icon: DoorOpen },
      { href: "/partner/listing", key: "layout.partnerShell.navListing", label: "My Listing", icon: Store },
    ],
    rail: true,
  },
  {
    id: "earnings",
    key: "layout.partnerShell.groupEarnings",
    label: "Earnings",
    icon: BadgeIndianRupee,
    primary: { href: "/partner/payouts", key: "layout.partnerShell.navPayouts", label: "Payouts", icon: Wallet },
    items: [
      {
        href: "/partner/commissions",
        key: "layout.partnerShell.navCommissions",
        label: "Commissions",
        icon: BadgeIndianRupee,
      },
    ],
    rail: true,
  },
  {
    id: "more",
    key: "layout.partnerShell.groupMore",
    label: "More",
    icon: Share2,
    primary: {
      href: "/partner/referral-tools",
      key: "layout.partnerShell.navReferralTools",
      label: "Referral Tools",
      icon: Share2,
    },
    items: [
      // Contact verification is the one-time gate in front of payouts and the
      // client desk; KYC itself lives on the Payouts page (KycPanel).
      {
        href: "/partner/verify-contact",
        key: "layout.partnerShell.navVerifyContact",
        label: "Verify contact",
        icon: ShieldCheck,
      },
    ],
    rail: false,
  },
];

/** Every item in a group, primary first — what the sheet, the sidebar and the space tabs list. */
export function groupItems(group: PartnerNavGroup): PartnerNavItem[] {
  return [group.primary, ...group.items];
}

function itemMatches(item: PartnerNavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The group a pathname belongs to. Longest matching href wins so that
 * `/partner/clients/new` resolves to the Families group's "New client" row
 * rather than to "Clients" by prefix — both are in the same group, so the rail
 * highlight is identical either way; only the sidebar row differs.
 */
export function activePartnerGroup(pathname: string | null): PartnerNavGroup | null {
  let best: { group: PartnerNavGroup; length: number } | null = null;
  for (const group of PARTNER_NAV_GROUPS) {
    for (const item of groupItems(group)) {
      if (itemMatches(item, pathname) && (!best || item.href.length > best.length)) {
        best = { group, length: item.href.length };
      }
    }
  }
  return best?.group ?? null;
}

/** The most specific item the pathname sits under, for the sidebar's row highlight. */
export function activePartnerItem(pathname: string | null): PartnerNavItem | null {
  let best: PartnerNavItem | null = null;
  for (const group of PARTNER_NAV_GROUPS) {
    for (const item of groupItems(group)) {
      if (itemMatches(item, pathname) && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best;
}
