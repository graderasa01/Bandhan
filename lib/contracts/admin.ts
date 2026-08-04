/** M01X — Admin contracts */
import type { MockMeta, MoneyModel, UIAction } from "./common";

export type AdminDashboardViewModel = {
  meta: MockMeta; admin: { displayName: string; role: "ADMIN" };
  metrics: { label: string; value: string | number; trend?: number; tone?: "neutral" | "trust" | "warning" | "danger" }[];
  pendingReviews: AdminReviewRowViewModel[];
  recentAuditLogs: AuditLogRowViewModel[];
};

export type AdminReviewRowViewModel = {
  id: string; subject: string; type: string; status: string; submittedDate: string; actions: UIAction[];
};

export type AuditLogRowViewModel = {
  id: string; timestamp: string; actor: string; role: string; action: string;
  target: string; previous: string; newValue: string;
};

export type VerificationReviewViewModel = {
  meta: MockMeta; items: { id: string; subject: string; type: string; submittedBy: string; status: string; actions: UIAction[] }[];
};

export type AdminPartnerReviewViewModel = {
  meta: MockMeta; partners: { id: string; name: string; type: string; city: string; appliedDate: string; status: string; actions: UIAction[] }[];
};

export type AdminCommissionPayoutViewModel = {
  meta: MockMeta; commissions: { id: string; partnerName: string; userDisplayName: string; plan: string; amount: MoneyModel; status: string; actions: UIAction[] }[];
  payouts: { id: string; partnerName: string; amount: MoneyModel; status: string; method: string; actions: UIAction[] }[];
};

export type AdminUserProfileViewModel = {
  meta: MockMeta; users: { id: string; displayName: string; city: string; profileStatus: string; trustScore: number | null; verified: boolean; actions: UIAction[] }[];
};
