import {
  BadgeIndianRupee,
  CalendarCheck,
  ClipboardList,
  DoorOpen,
  Home,
  MessageSquare,
  Share2,
  ShieldCheck,
  Store,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * The single source of truth for "where can a partner go".
 *
 * Mirrors `navItems.ts` for members: this used to be a flat 11-item array
 * inside PartnerShell, which put the referral tools on equal footing with the
 * partner's actual work and left the mobile rail showing an arbitrary first
 * four. Six spaces now, every old href still present — nothing was deleted and
 * no URL moved; only the grouping changed.
 *
 *   TODAY     — the dashboard: what needs doing right now.
 *   CLIENTS   — the people this partner is preparing: drafts, active clients,
 *               referral leads, and the invite that starts a relationship.
 *   RISHTE    — the rooms a client has let this partner into.
 *   BOOKINGS  — marketplace work that has been paid for, and the enquiries
 *               that become bookings.
 *   EARNINGS  — commissions, payouts, and the referral tools that feed both.
 *   MORE      — the listing, verification, and everything set up once.
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
   * lives under Clients even though it is its own row, so the group must not
   * light up twice.
   */
  exact?: boolean;
}

export interface PartnerNavGroup {
  id: "today" | "clients" | "rishte" | "bookings" | "earnings" | "more";
  key: string;
  label: string;
  icon: LucideIcon;
  /** The row the group's rail slot opens; also the first sidebar row. */
  primary: PartnerNavItem;
  /** Sub-pages of the same space, shown under a small heading in the sidebar. */
  items: PartnerNavItem[];
  /** Shown in the mobile rail. Exactly five groups carry this; MORE opens a sheet. */
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
    id: "clients",
    key: "layout.partnerShell.groupClients",
    label: "Clients",
    icon: ClipboardList,
    primary: { href: "/partner/clients", key: "layout.partnerShell.navClients", label: "Clients", icon: ClipboardList },
    items: [
      { href: "/partner/clients/new", key: "layout.partnerShell.navNewClient", label: "New client", icon: UserPlus },
      { href: "/partner/leads", key: "layout.partnerShell.navLeads", label: "Leads", icon: Users },
      { href: "/partner/invite", key: "layout.partnerShell.navInvite", label: "Invite", icon: Share2 },
    ],
    rail: true,
  },
  {
    id: "rishte",
    key: "layout.partnerShell.groupRishte",
    label: "Rishte",
    icon: DoorOpen,
    primary: { href: "/partner/rooms", key: "layout.partnerShell.navRooms", label: "Rishte", icon: DoorOpen },
    items: [],
    rail: true,
  },
  {
    id: "bookings",
    key: "layout.partnerShell.groupBookings",
    label: "Bookings",
    icon: CalendarCheck,
    primary: { href: "/partner/bookings", key: "layout.partnerShell.navBookings", label: "Bookings", icon: CalendarCheck },
    items: [
      { href: "/partner/enquiries", key: "layout.partnerShell.navEnquiries", label: "Enquiries", icon: MessageSquare },
    ],
    rail: true,
  },
  {
    id: "earnings",
    key: "layout.partnerShell.groupEarnings",
    label: "Earnings",
    icon: BadgeIndianRupee,
    primary: {
      href: "/partner/commissions",
      key: "layout.partnerShell.navCommissions",
      label: "Commissions",
      icon: BadgeIndianRupee,
    },
    items: [
      { href: "/partner/payouts", key: "layout.partnerShell.navPayouts", label: "Payouts", icon: Wallet },
      {
        href: "/partner/referral-tools",
        key: "layout.partnerShell.navReferralTools",
        label: "Referral Tools",
        icon: Share2,
      },
    ],
    rail: true,
  },
  {
    id: "more",
    key: "layout.partnerShell.groupMore",
    label: "More",
    icon: Store,
    primary: { href: "/partner/listing", key: "layout.partnerShell.navListing", label: "My Listing", icon: Store },
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

/** Every item in a group, primary first — what the sheet and the sidebar list. */
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
 * `/partner/clients/new` resolves to the Clients group's "New client" row
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
