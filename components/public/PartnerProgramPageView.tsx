import type { PartnerProgramViewModel } from "@/lib/contracts/publicPages";
import Card from "@/components/ui/Card";

type Props = { data: PartnerProgramViewModel };

export default function PartnerProgramPageView({ data }: Props) {
  const { hero, whoCanBecome, howItWorks, benefits, commissionTransparency, approvalProcess, trustAndPrivacy, faq, finalCTA } = data;

  return (
    <main style={{ maxWidth: "1024px", margin: "0 auto", padding: "var(--space-4)" }}>
      {/* Hero */}
      <section style={{ textAlign: "center", padding: "var(--space-16) 0 var(--space-12)" }}>
        <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", marginBottom: "var(--space-4)" }}>{hero.headline}</h1>
        <p style={{ fontSize: "var(--text-lg)", color: "var(--color-text-muted)", maxWidth: "640px", margin: "0 auto var(--space-8)" }}>{hero.description}</p>
        <a href={hero.cta.href} style={{ textDecoration: "none" }}>
          <span style={{ display: "inline-flex", padding: "14px 28px", fontSize: "var(--text-lg)", fontWeight: "var(--font-medium)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-primary)", color: "var(--color-text-inverse)", minHeight: "var(--touch-min)", alignItems: "center" }}>{hero.cta.label}</span>
        </a>
      </section>

      {/* Who Can Become */}
      <section style={{ padding: "var(--space-8) 0" }}>
        <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", textAlign: "center", marginBottom: "var(--space-4)" }}>{whoCanBecome.headline}</h2>
        <p style={{ fontSize: "var(--text-base)", color: "var(--color-text-muted)", textAlign: "center", marginBottom: "var(--space-8)" }}>{whoCanBecome.description}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
          {whoCanBecome.types.map((t) => (
            <Card key={t.id} variant="soft" padding="md">
              <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-semibold)", color: "var(--color-text)", marginBottom: "var(--space-2)" }}>{t.title}</h3>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{t.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section style={{ padding: "var(--space-8) 0" }}>
        <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", textAlign: "center", marginBottom: "var(--space-8)" }}>Kaise Kaam Karta Hai</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-4)" }}>
          {howItWorks.map((s) => (
            <Card key={s.step} variant="soft" padding="md">
              <div style={{ width: "36px", height: "36px", borderRadius: "var(--radius-full)", backgroundColor: "var(--color-primary)", color: "var(--color-text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "var(--font-bold)", fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>{s.step}</div>
              <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-semibold)", color: "var(--color-text)", marginBottom: "var(--space-2)" }}>{s.title}</h3>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{s.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section style={{ padding: "var(--space-8) 0", backgroundColor: "var(--color-bg-soft)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)" }}>
        <div style={{ padding: "var(--space-8)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", textAlign: "center", marginBottom: "var(--space-8)" }}>Partner Benefits</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
            {benefits.map((b, i) => (
              <Card key={i} variant="soft" padding="md">
                <h3 style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-semibold)", color: "var(--color-trust)", marginBottom: "var(--space-2)" }}>{b.title}</h3>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{b.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Commission Transparency */}
      <section style={{ padding: "var(--space-8) 0" }}>
        <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", textAlign: "center", marginBottom: "var(--space-4)" }}>{commissionTransparency.headline}</h2>
        <p style={{ fontSize: "var(--text-base)", color: "var(--color-text-muted)", textAlign: "center", maxWidth: "600px", margin: "0 auto var(--space-8)" }}>{commissionTransparency.description}</p>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-8)" }}>
          <div style={{ maxWidth: "360px", textAlign: "center", width: "100%" }}>
            <Card variant="elevated" padding="lg">
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginBottom: "var(--space-2)" }}>{commissionTransparency.example.plan}</div>
              <div style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", marginBottom: "var(--space-6)" }}>{commissionTransparency.example.commission}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", textAlign: "left" }}>
                {commissionTransparency.notes.map((note, i) => (
                  <div key={i} style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
                    <span style={{ color: "var(--color-trust)", flexShrink: 0 }}>✓</span> {note}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Approval Process */}
      <section style={{ padding: "var(--space-8) 0", backgroundColor: "var(--color-warning-soft)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)" }}>
        <div style={{ padding: "var(--space-8)", textAlign: "center" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--color-warning)", marginBottom: "var(--space-4)" }}>{approvalProcess.headline}</h2>
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-text)", maxWidth: "600px", margin: "0 auto var(--space-8)" }}>{approvalProcess.description}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxWidth: "400px", margin: "0 auto", textAlign: "left" }}>
            {approvalProcess.steps.map((s, i) => (
              <div key={i} style={{ fontSize: "var(--text-sm)", color: "var(--color-text)", display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "var(--radius-full)", backgroundColor: "var(--color-warning)", color: "var(--color-text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "var(--font-bold)", fontSize: "var(--text-xs)", flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust and Privacy */}
      <section style={{ padding: "var(--space-8) 0" }}>
        <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", textAlign: "center", marginBottom: "var(--space-8)" }}>{trustAndPrivacy.headline}</h2>
        <div style={{ maxWidth: "640px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {trustAndPrivacy.points.map((point, i) => (
            <div key={i} style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3)", backgroundColor: "var(--color-surface)", borderRadius: "var(--radius-sm)" }}>
              <span style={{ fontSize: "var(--text-lg)", flexShrink: 0 }}>🛡</span>
              <span>{point}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "var(--space-8) 0", backgroundColor: "var(--color-bg-soft)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)" }}>
        <div style={{ padding: "var(--space-8)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--color-primary-dark)", textAlign: "center", marginBottom: "var(--space-8)" }}>Frequently Asked Questions</h2>
          <div style={{ maxWidth: "640px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {faq.map((item, i) => (
              <Card key={i} variant="outlined" padding="md">
                <div style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-semibold)", color: "var(--color-text)", marginBottom: "var(--space-2)" }}>{item.q}</div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{item.a}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: "var(--space-16) 0", textAlign: "center", backgroundColor: "var(--color-primary-dark)", borderRadius: "var(--radius-lg)", marginBottom: "var(--space-8)" }}>
        <div style={{ padding: "var(--space-8)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--color-text-inverse)", marginBottom: "var(--space-4)" }}>Partner Banein Aur Commission Earn Karein</h2>
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-primary-soft)", maxWidth: "560px", margin: "0 auto var(--space-8)" }}>Verified partner network join karein aur genuine members refer kar ke commission earn karein.</p>
          <a href={finalCTA.href} style={{ textDecoration: "none", display: "inline-flex", padding: "14px 28px", fontSize: "var(--text-lg)", fontWeight: "var(--font-medium)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-primary)", color: "var(--color-text-inverse)" }}>{finalCTA.label}</a>
        </div>
      </section>
    </main>
  );
}