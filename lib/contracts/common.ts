/** M01X — Common contract types shared across all domains */

export type StatusTone = "neutral" | "trust" | "warning" | "danger" | "info" | "primary";

export type LoadingStateModel = { isLoading: boolean; message?: string };

export type UIAction = {
  label: string; href?: string; actionId?: string;
  requiresConfirmation?: boolean; disabled?: boolean;
};

export type EmptyStateModel = {
  title: string; description?: string;
  primaryAction?: UIAction; secondaryAction?: UIAction;
};

export type ErrorStateModel = { title: string; message: string; retryLabel?: string };

export type BlockedReason = "UNAUTHORIZED" | "PENDING_PARTNER" | "SUSPENDED" | "SUBSCRIPTION_LOCKED" | "PROFILE_INCOMPLETE";

export type BlockedStateModel = {
  reason: BlockedReason; title: string; message: string; action?: UIAction;
};

export type StatusBadgeModel = { label: string; tone: StatusTone };

export type MoneyModel = { amount: number; currency: "INR"; display: string };

export type MockMeta = { isMock: boolean; source: "mock" | "api"; label: string };

export const MOCK_LABEL = "MOCK DATA — Demo only — Not real user data";

export function makeMockMeta(source: "mock" | "api" = "mock"): MockMeta {
  return { isMock: source === "mock", source, label: MOCK_LABEL };
}
