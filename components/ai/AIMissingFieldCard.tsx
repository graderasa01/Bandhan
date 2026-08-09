"use client";

import { useT } from "@/components/i18n/LanguageProvider";

interface MissingField {
  name: string;
  reason: string;
}

interface AIMissingFieldCardProps {
  fields?: MissingField[];
  onAddNow?: (fieldName: string) => void;
  onAskAI?: (fieldName: string) => void;
}

export default function AIMissingFieldCard({
  fields,
  onAddNow,
  onAskAI,
}: AIMissingFieldCardProps) {
  const t = useT();
  const resolvedFields = fields ?? [
    { name: t("ai.missingFieldCard.heightName", "Height"), reason: t("ai.missingFieldCard.heightReason", "Better matches ke liye height add karein") },
    { name: t("ai.missingFieldCard.cityName", "Current City"), reason: t("ai.missingFieldCard.cityReason", "Location-based matches ke liye city zaroori hai") },
    { name: t("ai.missingFieldCard.preferenceName", "Partner Preference"), reason: t("ai.missingFieldCard.preferenceReason", "Suitable partner suggestions ke liye preference batayein") },
  ];
  return (
    <div
      style={{
        backgroundColor: "var(--color-warning-soft)",
        border: "1px solid var(--color-warning)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <span style={{ fontSize: "var(--text-base)" }}>⚠️</span>
        <h4 style={{
          fontSize: "var(--text-sm)",
          fontWeight: "var(--font-semibold)",
          color: "var(--color-warning)",
          margin: 0,
        }}>
          {t("ai.missingFieldCard.title", "Missing Fields")}
        </h4>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {resolvedFields.map((field) => (
          <div
            key={field.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              flexWrap: "wrap",
              padding: "var(--space-2) 0",
              borderBottom: "1px solid rgba(183, 121, 31, 0.15)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-medium)",
                color: "var(--color-text)",
                margin: 0,
              }}>
                {field.name}
              </p>
              <p style={{
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
                margin: "var(--space-1) 0 0 0",
              }}>
                {field.reason}
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--space-1)", flexShrink: 0 }}>
              <button
                onClick={() => onAddNow?.(field.name)}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  fontSize: "var(--text-xs)",
                  fontWeight: "var(--font-medium)",
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-text-inverse)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  minHeight: "var(--touch-min)",
                  transition: "background-color var(--transition-fast)",
                }}
              >
                {t("ai.missingFieldCard.addNow", "Add Now")}
              </button>
              <button
                onClick={() => onAskAI?.(field.name)}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  fontSize: "var(--text-xs)",
                  fontWeight: "var(--font-medium)",
                  backgroundColor: "var(--color-info-soft)",
                  color: "var(--color-info)",
                  border: "1px solid var(--color-info)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  minHeight: "var(--touch-min)",
                  transition: "background-color var(--transition-fast)",
                }}
              >
                {t("ai.missingFieldCard.askAI", "Ask AI")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}