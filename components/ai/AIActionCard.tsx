import { ReactNode } from "react";

interface AIActionCardProps {
  title: string;
  description?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
  icon?: ReactNode;
}

export default function AIActionCard({ title, description, onClick, disabled, badge, icon }: AIActionCardProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        width: "100%",
        textAlign: "left",
        backgroundColor: "var(--color-info-soft)",
        border: "1px solid var(--color-info)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background-color var(--transition-fast)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <span style={{ fontSize: "var(--text-sm)", flexShrink: 0 }}>
        {icon || "✨"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", color: "var(--color-info)" }}>
            {title}
          </span>
          {badge && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-info)", opacity: 0.7 }}>
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", margin: "var(--space-1) 0 0 0" }}>
            {description}
          </p>
        )}
      </div>
      <span style={{ color: "var(--color-info)", fontSize: "var(--text-sm)", flexShrink: 0 }}>→</span>
    </button>
  );
}