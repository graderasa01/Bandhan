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
  { route: '/user/subscription', category: 'user', allowedRoles: ['USER'], allowedUserStatuses: ['ACTIVE'] },
  // PARTNER
  { route: '/partner/pending', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'INACTIVE', 'REJECTED', 'SUSPENDED'] },
  { route: '/partner/dashboard', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
  { route: '/partner/leads', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE'] },
  { route: '/partner/referral-tools', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
  { route: '/partner/commissions', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
  { route: '/partner/payouts', category: 'partner', allowedRoles: ['PARTNER'], allowedPartnerStatuses: ['APPROVED', 'ACTIVE', 'INACTIVE'] },
  // ADMIN
  { route: '/admin/dashboard', category: 'admin', allowedRoles: ['ADMIN', 'SUPPORT'] },
  { route: '/admin/users', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/profiles', category: 'admin', allowedRoles: ['ADMIN', 'SUPPORT'] },
  { route: '/admin/partners', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/referrals', category: 'admin', allowedRoles: ['ADMIN'] },
  { route: '/admin/commissions', category: 'admin', allowedRoles: ['ADMIN'], blockedRoles: ['SUPPORT'] },
  { route: '/admin/payouts', category: 'admin', allowedRoles: ['ADMIN'], blockedRoles: ['SUPPORT'] },
  { route: '/admin/audit-logs', category: 'admin', allowedRoles: ['ADMIN'], blockedRoles: ['SUPPORT'] },
  { route: '/admin/verification', category: 'admin', allowedRoles: ['ADMIN', 'SUPPORT'] },
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