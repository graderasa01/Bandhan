interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  title: string;
  description?: string;
  primaryAction?: Action;
  secondaryAction?: Action;
  icon?: React.ReactNode;
}

function ActionButton({ action, isPrimary }: { action: Action; isPrimary: boolean }) {
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "var(--space-2) var(--space-5)",
    fontSize: "var(--text-sm)",
    fontWeight: "var(--font-medium)",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    textDecoration: "none",
    minHeight: "var(--touch-min)",
    transition: "background-color var(--transition-fast)",
    border: isPrimary ? "none" : "1px solid var(--color-primary)",
    backgroundColor: isPrimary ? "var(--color-primary)" : "transparent",
    color: isPrimary ? "var(--color-text-inverse)" : "var(--color-primary)",
  };

  if (action.href) {
    return (
      <a href={action.href} style={baseStyle}>
        <span>{action.label}</span>
      </a>
    );
  }
  return (
    <button onClick={action.onClick} style={{ ...baseStyle, fontFamily: "var(--font-sans)" }}>
      <span>{action.label}</span>
    </button>
  );
}

export default function EmptyState({ title, description, primaryAction, secondaryAction, icon }: EmptyStateProps) {
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
          backgroundColor: "var(--color-bg-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "var(--space-4)",
        }}
      >
        {icon || (
          <svg width="32" height="32" fill="none" stroke="var(--color-text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>
      <h3 style={{
        fontSize: "var(--text-lg)",
        fontWeight: "var(--font-semibold)",
        color: "var(--color-primary-dark)",
        marginBottom: "var(--space-2)",
      }}>
        {title}
      </h3>
      {description && (
        <p style={{
          fontSize: "var(--text-sm)",
          color: "var(--color-text-muted)",
          maxWidth: "360px",
          marginBottom: "var(--space-6)",
          lineHeight: "var(--leading-normal)",
        }}>
          {description}
        </p>
      )}
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "center" }}>
        {primaryAction && <ActionButton action={primaryAction} isPrimary />}
        {secondaryAction && <ActionButton action={secondaryAction} isPrimary={false} />}
      </div>
    </div>
  );
}