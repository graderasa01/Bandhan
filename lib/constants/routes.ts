export const ROUTES = {
  public: {
    home: "/",
    howItWorks: "/how-it-works",
    pricing: "/pricing",
    partnerProgram: "/partner-program",
    safety: "/safety",
    login: "/login",
    register: "/register",
  },
  user: {
    dashboard: "/user/dashboard",
    profileSetup: "/user/profile-setup",
    profileTrustScore: "/user/profile-trust-score",
    matches: "/user/matches",
    interests: "/user/interests",
    messages: "/user/messages",
    subscription: "/user/subscription",
  },
  partner: {
    register: "/partner/register",
    pending: "/partner/pending",
    dashboard: "/partner/dashboard",
    leads: "/partner/leads",
    referralTools: "/partner/referral-tools",
    commissions: "/partner/commissions",
    payouts: "/partner/payouts",
  },
  // Only routes that exist. This block used to list `/admin/dashboard`,
  // `/admin/profiles`, `/admin/referrals` and `/admin/payouts` — none of which
  // were ever built — while omitting most of the pages that were. The nav
  // itself now reads `components/layout/adminNavItems.ts`; this stays for the
  // handful of non-nav call sites.
  admin: {
    home: "/admin",
    users: "/admin/users",
    partners: "/admin/partners",
    commissions: "/admin/commissions",
    payments: "/admin/payments",
    auditLogs: "/admin/audit-logs",
    verification: "/admin/verification",
    moderation: "/admin/moderation",
  },
} as const;