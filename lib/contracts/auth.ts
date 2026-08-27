// BandhanTak — M02 Auth & Roles Domain Contracts
// Source: docs/bandhantak/modules/M02_auth_roles/auth_roles_spec.md

export type Role = 'USER' | 'PARTNER' | 'ADMIN' | 'SUPPORT';

export type UserStatus = 'ACTIVE' | 'INCOMPLETE' | 'SUSPENDED' | 'BLOCKED' | 'DELETED';

export type PartnerStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'REJECTED'
  | 'SUSPENDED';

// The 7 M10 values — kept in lockstep with the Prisma `PartnerType` enum and
// the types advertised on /partner-program. (Was 6, with a `LOCAL_DEALER` the
// spec never had and missing WEDDING_VENDOR/OTHER.)
export type PartnerType =
  | 'PANDIT'
  | 'MARRIAGE_BUREAU'
  | 'RISHTA_CONSULTANT'
  | 'COMMUNITY_COORDINATOR'
  | 'FAMILY_REFERENCE_PARTNER'
  | 'WEDDING_VENDOR'
  | 'OTHER';

export type RouteCategory = 'public' | 'user' | 'partner' | 'admin';

export interface RouteAccessRule {
  route: string;
  category: RouteCategory;
  allowedRoles: Role[];
  allowedUserStatuses?: UserStatus[];
  allowedPartnerStatuses?: PartnerStatus[];
  blockedRoles?: Role[];
}

export const ROUTE_ACCESS_MATRIX: RouteAccessRule[] = [
  // PUBLIC
  { route: '/', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  { route: '/how-it-works', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  { route: '/pricing', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  { route: '/partner-program', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  { route: '/safety', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  { route: '/login', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  { route: '/register', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  { route: '/forgot-password', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  { route: '/reset-password', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  // The admin panel's own front door — deliberately public at this layer (an
  // unauthenticated admin must be able to reach the login form) and
  // deliberately unlinked from any public nav. See app/admin/login/page.tsx.
  { route: '/admin/login', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  { route: '/partner/register', category: 'public', allowedRoles: ['USER', 'PARTNER', 'ADMIN', 'SUPPORT'] },
  // USER
  { route: '/user/dashboard', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/reel', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE'] },
  { route: '/user/profile-setup', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  // The voice-interview builder — needs a real logged-in user so its answers
  // attach to a real account (lib/profile/profileState.tsx now syncs to
  // /api/profile/save-draft, not just localStorage).
  { route: '/profile/build', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/profile-trust-score', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE'] },
  { route: '/user/matches', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE'] },
  { route: '/user/interests', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE'] },
  { route: '/user/messages', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE'] },
  { route: '/user/inbox', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE'] },
  { route: '/user/kundli', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE'] },
  // ACTIVE only, unlike /user/subscription: a campaign needs a live, nearly
  // complete profile to advertise, so an INCOMPLETE account could only ever
  // reach the eligibility checklist — and it would reach it having been sent
  // to a paid screen it cannot use.
  { route: '/user/spotlight', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE'] },
  // INCOMPLETE too, deliberately: this is the page you buy a plan on, and
  // ACTIVE-only made it the one paid surface a half-finished account could not
  // reach. `/pricing` is public and its CTA lands here, so a logged-in user
  // who had not finished the builder tapped "buy" and was silently redirected
  // to /profile/build — no message, no plan, no sale. `/user/boost`, also a
  // paid page, has allowed INCOMPLETE all along; this only makes the two agree.
  //
  // Nothing downstream needed loosening: /api/subscriptions/checkout gates on
  // `requireUser()` and never looked at status, and the page reads its profile
  // through optional chaining, so an account with no profile row renders it.
  { route: '/user/subscription', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  // INCOMPLETE too, same reasoning as /user/subscription above: the page
  // renders a FREE-safe preview for every plan (search itself 403s server
  // side for non-entitled plans) and GrioMap links here for INCOMPLETE users
  // too, so ACTIVE-only made this a dead link that bounced to /profile/build.
  { route: '/user/discover', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  // Reachable straight after registration, when status is still INCOMPLETE —
  // see the register route's `/user/verify-contact?next=...` redirect.
  { route: '/user/verify-contact', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  // The rest of /user/**, added 2026-08-08 after the same drift the ADMIN note
  // below describes turned up here too: each of these pages guards itself with
  // `getCurrentUser()`, which checks that *someone* is logged in but never
  // which role — so a signed-in PARTNER or ADMIN could load them and land on a
  // member screen with nothing in it. That is exactly the wrong-role dead end
  // middleware.ts's own comment describes.
  //
  // Both user statuses are allowed deliberately: it keeps this addition a pure
  // role fix. Whether an INCOMPLETE profile should be in the Vibe Hub is a
  // product question, and answering it here would silently change where
  // half-finished accounts land.
  { route: '/user/app-setup', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/biodata', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/boost', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/circle', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/concierge', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/deep-profile', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/family', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/grio-map', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  // Covers /user/profile/me, /user/profile/preview and /user/profile/<id>.
  { route: '/user/profile', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/shortlist', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  { route: '/user/vibe', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE', 'INCOMPLETE'] },
  // PARTNER
  { route: '/partner/pending', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'INACTIVE', 'REJECTED', 'SUSPENDED'] },
  { route: '/partner/dashboard', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
  { route: '/partner/leads', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE'] },
  // Same bar as /partner/leads — the page itself calls
  // `requirePartner(["APPROVED", "ACTIVE"])`; this mirrors it at the edge.
  { route: '/partner/invite', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE'] },
  { route: '/partner/referral-tools', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
  { route: '/partner/commissions', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
  { route: '/partner/payouts', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
  // Same bar as /partner/payouts — it is a step *of* the payout flow, and an
  // INACTIVE partner still has to be able to settle a pending balance.
  { route: '/partner/verify-contact', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
  // ADMIN — kept in lockstep with the `if (user.role !== "ADMIN") redirect("/")`
  // (or equivalent) each page in app/admin/**/page.tsx actually enforces. This
  // list drifted from that reality once before (M10-era routes like
  // /admin/dashboard, /admin/profiles, /admin/referrals and /admin/payouts were
  // renamed or folded into other pages during the 2026-08-07 admin redesign,
  // and none of the redesign's new routes were ever added here) — when it
  // drifts, the pages missing from this list simply skip the edge-layer gate
  // and rely solely on their own page-level check, which still works but loses
  // the fast no-DB-round-trip rejection this matrix exists for.
  { route: '/admin', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/growth', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/lifecycle', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/messages', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/verification', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/moderation', category: 'admin', allowedRoles: ['ADMIN'] },
  // M10 §23: SUPPORT may look at the partner queue but may never approve,
  // reject, suspend or reactivate — that half is enforced by `requireAdmin()`
  // on the PATCH route, which 403s SUPPORT no matter what the UI renders.
  // Covers /admin/partners/<id> too — matchRoute() takes the longest matching
  // prefix, and the detail page carries the same ADMIN+SUPPORT rule (read for
  // both, act for ADMIN only, enforced again by requireAdmin on its APIs).
  { route: '/admin/partners', category: 'admin', allowedRoles: ['ADMIN', 'SUPPORT'] },
  { route: '/admin/matchmaker', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/voice-access', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/users', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/payments', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/pricing', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/items', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/commissions', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/payouts', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/features', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/ai-settings', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/polls', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/theme', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/audit-logs', category: 'admin', allowedRoles: ['ADMIN'] },
  // New — account management for the admin panel itself (create ADMIN/SUPPORT
  // accounts). ADMIN only, same bar as /admin/users' status changes.
  { route: '/admin/admins', category: 'admin', allowedRoles: ['ADMIN'] },
];

export interface RegisterUserInput {
  full_name: string;
  mobile?: string;
  email?: string;
  password: string;
  referral_code?: string;
}

export interface RegisterPartnerInput {
  full_name: string;
  mobile: string;
  email?: string;
  password: string;
  partner_type: PartnerType;
  city: string;
  state: string;
}

export interface LoginInput {
  mobile_or_email: string;
  password: string;
}

export interface AuthResult {
  user: UserDto;
  session_token: string;
}

export interface UserDto {
  id: string;
  role: Role;
  status: UserStatus;
  full_name: string;
  mobile: string | null;
  email: string | null;
  mobile_verified_at: string | null;
  email_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface PartnerUserDto extends UserDto {
  partner_id: string;
  partner_status: PartnerStatus;
  partner_type: PartnerType;
  referral_code: string;
}

export interface SessionContext {
  user: {
    id: string;
    role: Role;
    status: string;
    partnerId?: string;
    partnerStatus?: string;
  };
  sessionId: string;
  expiresAt: Date;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  requiredRole?: string;
  requiredStatus?: string;
  message?: string;
}

export type SecurityEventType =
  | 'REGISTRATION'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_ATTEMPT_BLOCKED'
  | 'LOGOUT'
  | 'SESSION_REVOKED'
  | 'PASSWORD_CHANGED'
  | 'OTP_SENT'
  | 'OTP_VERIFIED'
  | 'ACCOUNT_BLOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_REACTIVATED'
  | 'ROLE_CHANGED';

export interface SecurityEvent {
  id: string;
  user_id: string | null;
  event_type: SecurityEventType;
  ip_address?: string;
  user_agent?: string;
  metadata_json?: Record<string, unknown>;
  created_at: string;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  reason?: string;
  required_role?: string;
  current_role?: string;
  current_status?: string;
}

export interface AiPermissionCheck {
  intent: string;
  allowed: boolean;
  reason?: string;
  required_role?: string;
  current_role?: string;
  current_status?: string;
  partner_status?: PartnerStatus;
  target_route?: string;
  message: string;
}

export type AdminAction =
  | 'approve_partner'
  | 'reject_partner'
  | 'suspend_partner'
  | 'approve_commission'
  | 'hold_commission'
  | 'reject_commission'
  | 'mark_payout_paid'
  | 'block_user'
  | 'change_discount'
  | 'change_commission_rate'
  | 'change_user_partner_mapping';

export type UserAction =
  | 'view_matches'
  | 'send_interest'
  | 'send_message'
  | 'purchase_subscription'
  | 'submit_profile'
  | 'upload_photo'
  | 'view_own_profile';

export type PartnerAction =
  | 'view_leads'
  | 'view_commissions'
  | 'view_payouts'
  | 'share_referral_link'
  | 'view_referral_tools';