import type { HowItWorksViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";

type Props = { data: HowItWorksViewModel };

export default function HowItWorksPageView({ data }: Props) {
  return (
    <main style={{ maxWidth: "960px", margin: "0 auto", padding: "var(--space-4)" }}>
      {/* Hero */}
      <section style={{ textAlign: "center", padding: "var(--space-16) 0 var(--space-12)" }}>
        <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", marginBottom: "var(--space-4)" }}>{data.hero.headline}</h1>
        <p style={{ fontSize: "var(--text-lg)", color: "var(--color-text-muted)", maxWidth: "600px", margin: "0 auto" }}>{data.hero.description}</p>
      </section>

      {/* Steps */}
      <section style={{ padding: "var(--space-8) 0 var(--space-16)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {data.steps.map((step, i) => (
            <Card key={step.step} variant="soft" padding="lg">
              <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "var(--radius-full)", backgroundColor: "var(--color-primary)", color: "var(--color-text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "var(--font-bold)", fontSize: "var(--text-lg)", flexShrink: 0 }}>
                  {step.step}
                </div>
                <div>
                  <h3 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)", color: "var(--color-text)", marginBottom: "var(--space-2)" }}>{step.title}</h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: "var(--leading-normal)" }}>{step.description}</p>
                </div>
              </div>
              {i < data.steps.length - 1 && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--space-4)" }}>
                  <span style={{ color: "var(--color-primary)", fontSize: "var(--text-xl)" }}>↓</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ textAlign: "center", padding: "var(--space-12) 0 var(--space-16)" }}>
        <a href={data.finalCTA.href} style={{ textDecoration: "none" }}>
          <span style={{ display: "inline-flex", padding: "14px 28px", fontSize: "var(--text-lg)", fontWeight: "var(--font-medium)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-primary)", color: "var(--color-text-inverse)", minHeight: "var(--touch-min)", alignItems: "center" }}>{data.finalCTA.label}</span>
        </a>
      </section>
    </main>
  );
}
