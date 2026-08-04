import { ReactNode } from "react";

type InsightVariant = "info" | "success" | "warning" | "danger" | "trust";

interface AIInsightCardProps {
  title: string;
  message: string;
  variant?: InsightVariant;
  badge?: string;
  ctaLabel?: string;
  onCta?: () => void;
  icon?: ReactNode;
}

const variantColors: Record<InsightVariant, { bg: string; border: string; text: string; icon: string }> = {
  info: { bg: "var(--color-info-soft)", border: "var(--color-info)", text: "var(--color-info)", icon: "💡" },
  success: { bg: "var(--color-trust-soft)", border: "var(--color-trust)", text: "var(--color-trust)", icon: "✅" },
  warning: { bg: "var(--color-warning-soft)", border: "var(--color-warning)", text: "var(--color-warning)", icon: "⚠️" },
  danger: { bg: "var(--color-danger-soft)", border: "var(--color-danger)", text: "var(--color-danger)", icon: "❗" },
  trust: { bg: "var(--color-trust-soft)", border: "var(--color-trust)", text: "var(--color-trust)", icon: "🛡️" },
};

export default function AIInsightCard({
  title,
  message,
  variant = "info",
  badge,
  ctaLabel,
  onCta,
  icon,
}: AIInsightCardProps) {
  const colors = variantColors[variant];

  return (
    <div
      style={{
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--text-base)", flexShrink: 0, marginTop: "2px" }}>
          {icon || colors.icon}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
            <h4 style={{
              fontSize: "var(--text-sm)",
              fontWeight: "var(--font-semibold)",
              color: colors.text,
              margin: 0,
            }}>
              {title}
            </h4>
            {badge && (
              <span style={{
                fontSize: "var(--text-xs)",
                fontWeight: "var(--font-medium)",
                color: colors.text,
                opacity: 0.8,
              }}>
                {badge}
              </span>
            )}
          </div>
          <p style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text)",
            lineHeight: "var(--leading-normal)",
            margin: 0,
          }}>
            {message}
          </p>
        </div>
      </div>
      {ctaLabel && onCta && (
        <button
          onClick={onCta}
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: "var(--font-medium)",
            color: colors.text,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: "var(--font-sans)",
            marginTop: "var(--space-2)",
            marginLeft: "calc(var(--text-base) + var(--space-2))",
          }}
        >
          {ctaLabel} →
        </button>
      )}
    </div>
  );
}