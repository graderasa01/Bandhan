"use client";

interface AIConfirmationCardProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  riskLevel?: "low" | "medium" | "high";
  onConfirm?: () => void;
  onCancel?: () => void;
}

const riskIcons: Record<string, string> = {
  low: "ℹ️",
  medium: "⚠️",
  high: "❗",
};

export default function AIConfirmationCard({
  title = "Kya aap profile submit karna chahte hain?",
  description = "Submit se pehle details review kar lijiye.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  riskLevel = "low",
  onConfirm,
  onCancel,
}: AIConfirmationCardProps) {
  return (
    <div
      style={{
        backgroundColor: "var(--color-warning-soft)",
        border: "1px solid var(--color-warning)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <span style={{ fontSize: "var(--text-xl)", flexShrink: 0 }}>
          {riskIcons[riskLevel]}
        </span>
        <div>
          <h4 style={{
            fontSize: "var(--text-base)",
            fontWeight: "var(--font-semibold)",
            color: "var(--color-text)",
            margin: 0,
            marginBottom: "var(--space-1)",
          }}>
            {title}
          </h4>
          <p style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-muted)",
            margin: 0,
            lineHeight: "var(--leading-normal)",
          }}>
            {description}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "var(--space-2) var(--space-4)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--font-medium)",
            backgroundColor: "transparent",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            minHeight: "var(--touch-min)",
            transition: "background-color var(--transition-fast)",
          }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          style={{
            padding: "var(--space-2) var(--space-4)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--font-medium)",
            backgroundColor: riskLevel === "high" ? "var(--color-danger)" : "var(--color-primary)",
            color: "var(--color-text-inverse)",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            minHeight: "var(--touch-min)",
            transition: "background-color var(--transition-fast)",
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}