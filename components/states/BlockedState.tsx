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

const defaultCopy: Record<BlockedReason, { title: string; description: string; action: string }> = {
  unauthorized: {
    title: "Aapko is page ka access nahi hai.",
    description: "Is page ko dekhne ke liye aapko login karna hoga ya alag role ki zaroorat hai.",
    action: "Go to Dashboard",
  },
  pendingPartner: {
    title: "Aapka partner account abhi approval pending hai.",
    description: "Approval ke baad dashboard access milega. Hum jald hi aapke application ko review karenge.",
    action: "Go to Home",
  },
  suspended: {
    title: "Aapka account temporarily suspended hai.",
    description: "Kuch issue ki wajah se aapka account hold par hai. Support team se contact karein.",
    action: "Contact Support",
  },
  subscriptionLocked: {
    title: "Subscription required hai.",
    description: "Is feature ko use karne ke liye active subscription ki zaroorat hai. Plans dekhein aur activate karein.",
    action: "Plans Dekhein",
  },
  profileIncomplete: {
    title: "Profile incomplete hai.",
    description: "Is section ko access karne se pehle apni profile complete karni hogi. Required details add karein.",
    action: "Profile Complete Karein",
  },
};

export default function BlockedState({
  reason = "unauthorized",
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: BlockedStateProps) {
  const copy = defaultCopy[reason];

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