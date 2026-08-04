"use client";
import { useState } from "react";
import type { PartnerRegisterViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";

type Props = { data: PartnerRegisterViewModel };

export default function PartnerRegisterPageView({ data }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState(false);

  const requiredFieldsFilled = data.fields.every((f) => (values[f] ?? "").trim().length > 0);
  const canSubmit = requiredFieldsFilled && agreed;

  const setField = (field: string, value: string) => setValues((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
  };

  return (
    <main style={{ maxWidth: "640px", margin: "var(--space-16) auto", padding: "0 var(--space-4)" }}>
      <Card variant="default" padding="lg">
        <h1
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: "var(--font-bold)",
            color: "var(--color-primary-dark)",
            textAlign: "center",
            marginBottom: "var(--space-2)",
          }}
        >
          {data.hero.headline}
        </h1>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-muted)",
            textAlign: "center",
            marginBottom: "var(--space-6)",
          }}
        >
          {data.hero.description}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {data.fields.map((f, i) => {
            const isEmpty = touched && !(values[f] ?? "").trim();

            if (f === "Partner Type") {
              return (
                <div key={i} style={{ marginBottom: "var(--space-4)" }}>
                  <label
                    htmlFor="partner-type"
                    style={{
                      display: "block",
                      fontSize: "var(--text-sm)",
                      fontWeight: "var(--font-medium)",
                      color: "var(--color-text)",
                      marginBottom: "var(--space-1)",
                    }}
                  >
                    Partner Type
                  </label>
                  <select
                    id="partner-type"
                    value={values[f] ?? ""}
                    onChange={(e) => setField(f, e.target.value)}
                    aria-invalid={isEmpty}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      fontSize: "var(--text-base)",
                      border: `1px solid ${isEmpty ? "var(--color-danger)" : "var(--color-border)"}`,
                      borderRadius: "var(--radius-md)",
                      fontFamily: "var(--font-sans)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  >
                    <option value="">Select type...</option>
                    {data.partnerTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {isEmpty && (
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", margin: "var(--space-1) 0 0" }}>
                      Partner type select karein
                    </p>
                  )}
                </div>
              );
            }

            return (
              <div key={i} style={{ marginBottom: "var(--space-4)" }}>
                <Input
                  label={f}
                  placeholder={f}
                  value={values[f] ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField(f, e.target.value)}
                  aria-invalid={isEmpty}
                />
                {isEmpty && (
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", margin: "var(--space-1) 0 0" }}>
                    {f} zaroori hai
                  </p>
                )}
              </div>
            );
          })}

          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
              style={{
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "center",
                fontSize: "var(--text-sm)",
                color: "var(--color-text-muted)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ width: "16px", height: "16px", accentColor: "var(--color-primary)" }}
              />
              I agree to terms and conditions
            </label>
            {touched && !agreed && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", margin: "var(--space-1) 0 0" }}>
                Aage badhne ke liye terms accept karein
              </p>
            )}
          </div>

          <div style={{ marginBottom: "var(--space-4)" }}>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "var(--text-base)",
                fontWeight: "var(--font-medium)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-primary)",
                color: "var(--color-text-inverse)",
                border: "none",
                cursor: canSubmit ? "pointer" : "not-allowed",
                opacity: canSubmit ? 1 : 0.5,
                fontFamily: "var(--font-sans)",
                minHeight: "var(--touch-min)",
              }}
            >
              {data.submitLabel}
            </button>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", textAlign: "center", marginTop: "var(--space-2)" }}>
              M01 demo: real submission nahi hai
            </p>
          </div>
        </form>

        <div style={{ textAlign: "center", borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-4)" }}>
          <a href={data.pendingLink.href} style={{ fontSize: "var(--text-sm)", color: "var(--color-primary)", textDecoration: "none" }}>
            {data.pendingLink.label}
          </a>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-info-soft)",
            color: "var(--color-info)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            marginTop: "var(--space-4)",
            fontSize: "var(--text-sm)",
            textAlign: "center",
          }}
        >
          {data.approvalNote}
        </div>
      </Card>
    </main>
  );
}
