import type { PartnerPendingViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";

type Props = { data: PartnerPendingViewModel };

export default function PartnerPendingPageView({ data }: Props) {
  return (
    <main style={{ maxWidth: "560px", margin: "var(--space-16) auto", padding: "0 var(--space-4)" }}>
      <Card variant="warning" padding="lg">
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-warning-soft)",
              border: "2px solid var(--color-warning)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--text-2xl)",
              margin: "0 auto var(--space-4)",
            }}
            aria-hidden="true"
          >
            ⏳
          </div>

          <span
            style={{
              display: "inline-block",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--font-semibold)",
              color: "var(--color-warning)",
              backgroundColor: "var(--color-warning-soft)",
              border: "1px solid var(--color-warning)",
              borderRadius: "var(--radius-full)",
              padding: "var(--space-1) var(--space-3)",
              marginBottom: "var(--space-3)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            Pending
          </span>

          <h1
            style={{
              fontSize: "var(--text-2xl)",
              fontWeight: "var(--font-bold)",
              color: "var(--color-warning)",
              marginBottom: "var(--space-3)",
            }}
          >
            {data.heading}
          </h1>
          <p
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: "var(--font-medium)",
              color: "var(--color-text)",
              marginBottom: "var(--space-3)",
            }}
          >
            {data.message}
          </p>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>
            {data.explanation}
          </p>

          <div
            style={{
              textAlign: "left",
              marginBottom: "var(--space-6)",
              padding: "var(--space-4)",
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h2
              style={{
                fontSize: "var(--text-base)",
                fontWeight: "var(--font-semibold)",
                color: "var(--color-text)",
                marginBottom: "var(--space-3)",
              }}
            >
              Aage Kya Hoga:
            </h2>
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {data.nextSteps.map((step, i) => (
                <li key={i} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: "22px",
                      height: "22px",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: "var(--color-warning)",
                      color: "var(--color-text-inverse)",
                      fontSize: "var(--text-xs)",
                      fontWeight: "var(--font-bold)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", paddingTop: "2px" }}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href={data.primaryAction.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 20px",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-medium)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-warning)",
                color: "var(--color-text-inverse)",
                minHeight: "var(--touch-min)",
                textDecoration: "none",
              }}
            >
              {data.primaryAction.label}
            </a>
            <a
              href={data.secondaryAction.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 20px",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-medium)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                minHeight: "var(--touch-min)",
                textDecoration: "none",
              }}
            >
              {data.secondaryAction.label}
            </a>
          </div>
        </div>
      </Card>
    </main>
  );
}
