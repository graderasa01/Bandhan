import type { SafetyPageViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";

type Props = { data: SafetyPageViewModel };

export default function SafetyPageView({ data }: Props) {
  return (
    <main style={{ maxWidth: "860px", margin: "0 auto", padding: "var(--space-4)" }}>
      <section style={{ textAlign: "center", padding: "var(--space-16) 0 var(--space-12)" }}>
        <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", marginBottom: "var(--space-4)" }}>Safety & Trust</h1>
        <p style={{ fontSize: "var(--text-lg)", color: "var(--color-text-muted)", maxWidth: "600px", margin: "0 auto" }}>BandhanTak par aapki safety aur privacy hamari priority hai.</p>
      </section>
      <section style={{ padding: "0 0 var(--space-12)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {data.sections.map((sec, i) => (
            <Card key={i} variant="trust" padding="lg">
              <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-semibold)", color: "var(--color-primary-dark)", marginBottom: "var(--space-3)" }}>{sec.title}</h2>
              <p style={{ fontSize: "var(--text-base)", color: "var(--color-text)", lineHeight: "var(--leading-normal)" }}>{sec.content}</p>
            </Card>
          ))}
        </div>
      </section>
      {data.report && (
        <section style={{ padding: "var(--space-8) 0 var(--space-16)", textAlign: "center" }}>
          <Card variant="warning" padding="lg">
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-semibold)", color: "var(--color-warning)", marginBottom: "var(--space-3)" }}>{data.report.headline}</h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text)", marginBottom: "var(--space-4)" }}>{data.report.description}</p>
            <a href={data.report.cta.href} style={{ textDecoration: "none" }}>
              <span style={{ display: "inline-flex", padding: "10px 20px", fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-warning)", color: "var(--color-warning)", minHeight: "var(--touch-min)", alignItems: "center" }}>{data.report.cta.label}</span>
            </a>
          </Card>
        </section>
      )}
    </main>
  );
}
