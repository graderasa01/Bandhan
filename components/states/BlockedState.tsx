"use client";

import { useT } from "@/components/i18n/LanguageProvider";
import type { Translate } from "@/lib/i18n/translate";

type BlockedReason = "unauthorized" | "pendingPartner" | "suspended" | "subscriptionLocked" | "profileIncomplete";

interface BlockedStateProps {
  reason?: BlockedReason;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

function defaultCopyFor(t: Translate): Record<BlockedReason, { title: string; description: string; action: string }> {
  return {
    unauthorized: {
      title: t("states.blockedState.unauthorizedTitle", "Aapko is page ka access nahi hai."),
      description: t(
        "states.blockedState.unauthorizedDescription",
        "Is page ko dekhne ke liye aapko login karna hoga ya alag role ki zaroorat hai.",
      ),
      action: t("states.blockedState.unauthorizedAction", "Go to Dashboard"),
    },
    pendingPartner: {
      title: t("states.blockedState.pendingPartnerTitle", "Aapka partner account abhi approval pending hai."),
      description: t(
        "states.blockedState.pendingPartnerDescription",
        "Approval ke baad dashboard access milega. Hum jald hi aapke application ko review karenge.",
      ),
      action: t("states.blockedState.pendingPartnerAction", "Go to Home"),
    },
    suspended: {
      title: t("states.blockedState.suspendedTitle", "Aapka account temporarily suspended hai."),
      description: t(
        "states.blockedState.suspendedDescription",
        "Kuch issue ki wajah se aapka account hold par hai. Support team se contact karein.",
      ),
      action: t("states.blockedState.suspendedAction", "Contact Support"),
    },
    subscriptionLocked: {
      title: t("states.blockedState.subscriptionLockedTitle", "Subscription required hai."),
      description: t(
        "states.blockedState.subscriptionLockedDescription",
        "Is feature ko use karne ke liye active subscription ki zaroorat hai. Plans dekhein aur activate karein.",
      ),
      action: t("states.blockedState.subscriptionLockedAction", "Plans Dekhein"),
    },
    profileIncomplete: {
      title: t("states.blockedState.profileIncompleteTitle", "Profile incomplete hai."),
      description: t(
        "states.blockedState.profileIncompleteDescription",
        "Is section ko access karne se pehle apni profile complete karni hogi. Required details add karein.",
      ),
      action: t("states.blockedState.profileIncompleteAction", "Profile Complete Karein"),
    },
  };
}

export default function BlockedState({
  reason = "unauthorized",
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: BlockedStateProps) {
  const t = useT();
  const copy = defaultCopyFor(t)[reason];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-16) var(--space-4)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "var(--radius-full)",
          backgroundColor: "var(--color-danger-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "var(--space-4)",
        }}
      >
        <svg width="32" height="32" fill="none" stroke="var(--color-danger)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 style={{
        fontSize: "var(--text-lg)",
        fontWeight: "var(--font-semibold)",
        color: "var(--color-danger)",
        marginBottom: "var(--space-2)",
      }}>
        {title || copy.title}
      </h3>
      <p style={{
        fontSize: "var(--text-sm)",
        color: "var(--color-text-muted)",
        maxWidth: "360px",
        marginBottom: "var(--space-6)",
        lineHeight: "var(--leading-normal)",
      }}>
        {description || copy.description}
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={onAction}
          style={{
            padding: "var(--space-2) var(--space-5)",
            backgroundColor: "var(--color-primary)",
            color: "var(--color-text-inverse)",
            border: "none",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--font-medium)",
            cursor: "pointer",
            minHeight: "var(--touch-min)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {actionLabel || copy.action}
        </button>
        {secondaryLabel && onSecondary && (
          <button
            onClick={onSecondary}
            style={{
              padding: "var(--space-2) var(--space-5)",
              backgroundColor: "transparent",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--font-medium)",
              cursor: "pointer",
              minHeight: "var(--touch-min)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}