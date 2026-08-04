import type { AdminDashboardViewModel } from "@/lib/contracts/admin";
import { makeMockMeta } from "@/lib/contracts/common";

export const mockAdminDashboardData: AdminDashboardViewModel = {
  meta: makeMockMeta("mock"),
  admin: { displayName: "Admin Demo", role: "ADMIN" },
  metrics: [
    { label: "Total Users", value: 1245, trend: 12 },
    { label: "Verified Profiles", value: 780, trend: 8, tone: "trust" },
    { label: "Pending Profiles", value: 120, tone: "warning" },
    { label: "Total Partners", value: 85, trend: 5, tone: "trust" },
    { label: "Pending Partners", value: 12, trend: -2, tone: "warning" },
    { label: "Paid Subscriptions", value: 340, trend: 15, tone: "trust" },
    { label: "Pending Commissions", value: 56, tone: "warning" },
    { label: "Payouts To Review", value: 23, tone: "danger" },
    { label: "Suspicious Signals", value: 7, tone: "danger" },
  ],
  pendingReviews: [
    { id: "r-001", subject: "Commission #C-1042", type: "Commission", status: "Pending", submittedDate: "2026-01-12", actions: [{ label: "Review", actionId: "review-commission" }] },
    { id: "r-002", subject: "Partner #P-2056", type: "Partner Approval", status: "Pending", submittedDate: "2026-01-15", actions: [{ label: "Review", actionId: "review-partner" }] },
  ],
  recentAuditLogs: [
    { id: "a-001", timestamp: "2026-01-12 14:30", actor: "Admin Demo", role: "ADMIN", action: "APPROVED commission", target: "Commission #C-1042", previous: "PENDING", newValue: "APPROVED" },
    { id: "a-002", timestamp: "2026-01-12 11:15", actor: "Admin Demo", role: "ADMIN", action: "APPROVED partner", target: "Partner #P-2056", previous: "PENDING_APPROVAL", newValue: "APPROVED" },
    { id: "a-003", timestamp: "2026-01-11 16:45", actor: "Admin Demo", role: "ADMIN", action: "MARKED payout paid", target: "Payout #P-981", previous: "READY", newValue: "PAID" },
  ],
};

// Legacy compat
export const MOCK_ADMIN = mockAdminDashboardData.admin;
export const MOCK_ADMIN_METRICS = {
  totalUsers: 1245, verifiedProfiles: 780, pendingProfiles: 120,
  totalPartners: 85, pendingPartners: 12, paidSubscriptions: 340,
  pendingCommissions: 56, payoutsToReview: 23, suspiciousSignals: 7,
};
export const MOCK_PENDING_PARTNERS = [
  { name: "New Partner 1", type: "Marriage Bureau", city: "Demo City", appliedDate: "2026-01-20", status: "PENDING_APPROVAL" },
  { name: "New Partner 2", type: "Rishta Consultant", city: "Demo Town", appliedDate: "2026-01-22", status: "PENDING_APPROVAL" },
];
export const MOCK_AUDIT_LOGS = mockAdminDashboardData.recentAuditLogs;
