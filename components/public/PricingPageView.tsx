import Link from "next/link";
import { BellRing, FileText, Lock, XCircle } from "lucide-react";
import type { PricingPageViewModel } from "@/lib/contracts/publicPages";
import { getT } from "@/lib/i18n/server";
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import Card from "@/components/ui/Card";
import PlanCard from "@/components/subscription/PlanCard";
import PlanComparisonTable from "@/components/subscription/PlanComparisonTable";
import FaqAccordion from "@/components/public/FaqAccordion";

type Props = { data: PricingPageViewModel };

/**
 * M09 §14 anti-dark-pattern promises, stated on the page rather than buried in
 * terms. Each one is a rule the code actually enforces, not marketing.
 */
const PROMISES = [
  { icon: XCircle, key: "pricing.promise.cancel", text: "Kabhi bhi cancel — 2 tap me, koi phone call nahi" },
  { icon: BellRing, key: "pricing.promise.reminder", text: "Renewal se 7 din pehle reminder" },
  { icon: FileText, key: "pricing.promise.invoice", text: "Har payment ka GST invoice download" },
  { icon: Lock, key: "pricing.promise.card", text: "Card details kabhi store nahi hoti" },
];

export default async function PricingPageView({ data }: Props) {
  const t = await getT();
  // FREE is structurally ₹0 — planService refuses to price it otherwise.
  const prices: Record<string, string> = { FREE: "₹0" };
  for (const plan of data.plans) prices[plan.id.toUpperCase()] = plan.price.display;

  return (
    <main>
      <Section>
        <Container>
          <SectionHeading
            eyebrow={t("pricing.eyebrow", "Pricing")}
            title={data.hero.headline}
            description={data.hero.description}
          />

          {data.partnerDiscountNote && (
            <p className="mx-auto mt-6 max-w-xl text-center text-[0.875rem] text-muted">
              {data.partnerDiscountNote}
            </p>
          )}

          {data.plans.length === 0 ? (
            <Card variant="soft" padding="lg" className="mx-auto mt-12 max-w-md text-center">
              <p className="text-[0.9375rem] text-muted">
                {t("pricing.emptyPlans", "Abhi koi plan available nahi hai.")}
              </p>
            </Card>
          ) : (
            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {data.plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} ctaHref={data.finalCTA.href ?? "/register"} t={t} />
              ))}
            </div>
          )}

          <p className="mt-6 text-center text-[0.875rem] text-muted">
            {t(
              "pricing.freeNote",
              "Free plan hamesha free rehta hai — roz 3 rishtey, bina kisi kharche ke.",
            )}
          </p>
        </Container>
      </Section>

      <Section tone="subtle">
        <Container>
          <SectionHeading
            title={t("pricing.comparisonTitle", "Har plan me kya milta hai")}
            description={t("pricing.comparisonDescription", "Poori tulna — koi hidden limit nahi.")}
          />
          <div className="mt-10">
            <PlanComparisonTable plans={data.comparisonPlans} />
          </div>
        </Container>
      </Section>

      <Section>
        <Container size="narrow">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROMISES.map((p) => (
              <Card key={p.text} variant="soft" padding="md">
                <div className="flex items-start gap-3">
                  <p.icon className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
                  <span className="text-[0.875rem] text-ink">{t(p.key, p.text)}</span>
                </div>
              </Card>
            ))}
          </div>

          {data.paymentSafetyNote && (
            <Card variant="trust" padding="md" className="mt-6">
              <p className="text-center text-[0.875rem] text-trust">🔒 {data.paymentSafetyNote}</p>
            </Card>
          )}
        </Container>
      </Section>

      {data.faq.length > 0 && (
        <Section tone="subtle">
          <Container size="narrow">
            <SectionHeading title={t("pricing.faqTitle", "Aksar poochhe jaane wale sawaal")} />
            <div className="mt-10">
              <FaqAccordion items={data.faq} />
            </div>
          </Container>
        </Section>
      )}

      {data.finalCTA.href && (
        <Section>
          <Container size="narrow">
            <Card variant="elevated" padding="xl" className="text-center">
              <h2 className="text-2xl font-semibold text-ink sm:text-3xl">
                {t("pricing.finalCtaTitle", "Shuruaat free hai")}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted">
                {t(
                  "pricing.finalCtaDescription",
                  "Profile banane ke liye koi payment nahi. Plan tab lijiye jab aapko lage ki zaroorat hai.",
                )}
              </p>
              <Link
                href={data.finalCTA.href}
                className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-[0.9375rem] font-semibold text-primary-fg shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-gold focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {data.finalCTA.label}
              </Link>
            </Card>
          </Container>
        </Section>
      )}
    </main>
  );
}
