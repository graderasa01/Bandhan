/** M01X — AI UI response contracts */

export type AIRoleContext = "PUBLIC" | "USER" | "PARTNER" | "ADMIN" | "SUPPORT";
export type AIMessageSender = "ai" | "user" | "system_safe";

export type AIMessageViewModel = {
  id: string; sender: AIMessageSender; text: string; timestampLabel?: string;
};

export type AIActionRiskLevel =
  | "SAFE_NAVIGATION" | "LOW_RISK_UPDATE" | "MEDIUM_RISK_ACTION"
  | "HIGH_RISK_ACTION" | "CRITICAL_ADMIN_ACTION" | "BLOCKED_ACTION";

export type AIActionViewModel = {
  id: string; label: string; description?: string; icon?: string;
  href?: string; actionId?: string; riskLevel: AIActionRiskLevel;
  requiresConfirmation: boolean; disabled?: boolean; reasonCode?: string;
};

export type AIMissingFieldViewModel = {
  fieldKey: string; label: string; whyNeeded: string; action?: AIActionViewModel;
};

export type AIConfirmationViewModel = {
  id: string; title: string; description: string;
  confirmLabel: string; cancelLabel: string; actionId: string;
  riskLevel: AIActionRiskLevel; auditNote?: string;
};

export type AIInsightTone = "info" | "success" | "warning" | "danger" | "trust";

export type AIInsightViewModel = {
  id: string; tone: AIInsightTone; title: string; message: string;
  ctaLabel?: string; ctaActionId?: string;
};

export type AIDrawerViewModel = {
  roleContext: AIRoleContext; currentPageLabel: string;
  greeting: string; messages: AIMessageViewModel[];
  quickActions: AIActionViewModel[];
  missingFields?: AIMissingFieldViewModel[];
  confirmation?: AIConfirmationViewModel | null;
  insights?: AIInsightViewModel[];
  isThinking?: boolean; blockedMessage?: string | null;
};
