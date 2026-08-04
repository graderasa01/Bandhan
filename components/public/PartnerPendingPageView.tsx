import type { PartnerPendingViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";

type Props = { data: PartnerPendingViewModel };

export default function PartnerPendingPageView({ data }: Props) {
  const { heading, message, explanation, nextSteps, primaryAction, secondaryAction } = data;
  return (
    <main style={{ maxWidth: "640px", margin: "0 auto", padding: "var(--space-4)" }}>
      <section style={{ textAlign: "center", padding: "var(--space-16) 0 var(--space-8)" }}>
        <div style={{ fontSize: "var(--text-4xl)", marginBottom: "var(--space-4)" }}>⏳</div>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", marginBottom: "var(--space-4)" }}>{heading}</h1>
        <p style={{ fontSize: "var(--text-lg)", color: "var(--color-text-muted)", maxWidth: "480px", margin: "0 auto var(--space-6)" }}>{message}</p>
      </section>

      <section style={{ padding: "var(--space-4) 0 var(--space-8)" }}>
        <Card variant="soft" padding="lg">
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)", color: "var(--color-text)", marginBottom: "var(--space-3)" }}>Kya Hoga Next?</h2>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>{explanation}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {nextSteps.map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", fontSize: "var(--text-sm)", color: "var(--color-text)" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "var(--radius-full)", backgroundColor: "var(--color-primary-soft)", color: "var(--color-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "var(--font-bold)", fontSize: "var(--text-sm)", flexShrink: 0 }}>{i + 1}</div>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section style={{ padding: "var(--space-8) 0", display: "flex", gap: "var(--space-4)", justifyContent: "center", flexWrap: "wrap" }}>
        <a href={primaryAction.href} style={{ textDecoration: "none", display: "inline-flex", padding: "12px 24px", fontSize: "var(--text-base)", fontWeight: "var(--font-medium)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-primary)", color: "var(--color-text-inverse)", minHeight: "var(--touch-min)", alignItems: "center" }}>{primaryAction.label}</a>
        <a href={secondaryAction.href} style={{ textDecoration: "none", display: "inline-flex", padding: "12px 24px", fontSize: "var(--text-base)", fontWeight: "var(--font-medium)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-primary)", color: "var(--color-primary)", minHeight: "var(--touch-min)", alignItems: "center" }}>{secondaryAction.label}</a>
      </section>
    </main>
  );
}