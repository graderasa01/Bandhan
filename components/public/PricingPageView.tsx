import Link from "next/link";
import { BellRing, FileText, Lock, ShieldCheck, XCircle } from "lucide-react";
import type { PricingPageViewModel } from "@/lib/contracts/publicPages";
import { getT } from "@/lib/i18n/server";
import { Container } from "@/components/ui/Container";
import PlanCard from "@/components/subscription/PlanCard";
import PlanComparisonTable from "@/components/subscription/PlanComparisonTable";
import FaqAccordion from "@/components/public/FaqAccordion";
import CanvasHeading from "@/components/public/_shared/CanvasHeading";
import { LeafSpray, RuleMotif } from "@/components/public/_shared/Ornaments";

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
  return (
    <main>
      <Container size="wide" className="flex flex-col gap-5 pb-16 pt-4 sm:gap-7 sm:pb-20 sm:pt-6">
        {/* Hero + the plans themselves — one panel, because the price is the
            page and splitting the promise from the number puts a seam through
            the only thing anybody came here to read. */}
        <section className="bt-shell bt-shell--cream bt-shell--foil px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <LeafSpray className="bt-vine -left-12 -top-14 h-[240px] w-[144px] sm:-left-14 sm:-top-16 sm:h-[320px] sm:w-[192px]" />

          <div className="relative">
            <CanvasHeading
              as="h1"
              size="lg"
              eyebrow={t("pricing.eyebrow", "Pricing")}
              title={data.hero.headline}
              description={data.hero.description}
            />

            {data.partnerDiscountNote && (
              <p className="mx-auto mt-5 max-w-xl text-center text-[0.875rem] text-muted">
                {data.partnerDiscountNote}
              </p>
            )}

            {data.plans.length === 0 ? (
              <div className="bt-card mx-auto mt-12 max-w-md p-6 text-center">
                <p className="text-[0.9375rem] text-muted">
                  {t("pricing.emptyPlans", "Abhi koi plan available nahi hai.")}
                </p>
              </div>
            ) : (
              /* pt-4: PlanCard hangs its "recommended" badge above its own top
                 edge, and this panel clips its overflow. */
              <div className="mt-12 grid grid-cols-1 gap-6 pt-4 md:grid-cols-3">
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
          </div>
        </section>

        <section className="bt-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <CanvasHeading
            title={t("pricing.comparisonTitle", "Har plan me kya milta hai")}
            description={t("pricing.comparisonDescription", "Poori tulna — koi hidden limit nahi.")}
          />
          {/* The table carries its own overflow-x, which it has to: this panel
              clips, and the ladder is wider than a phone. */}
          <div className="mt-10">
            <PlanComparisonTable plans={data.comparisonPlans} />
          </div>
        </section>

        <section className="bt-shell bt-shell--cream px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <div className="mx-auto max-w-3xl">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PROMISES.map((p) => (
                <div key={p.text} className="bt-card flex items-start gap-3.5 p-5">
                  <span className="bt-ring bt-ring--trust [--paper-ring-size:2.25rem]">
                    <p.icon className="size-[17px]" aria-hidden />
                  </span>
                  <span className="pt-1.5 text-[0.875rem] leading-snug text-ink">
                    {t(p.key, p.text)}
                  </span>
                </div>
              ))}
            </div>

            {data.paymentSafetyNote && (
              <div className="bt-card mt-5 flex items-center justify-center gap-3 p-5">
                <ShieldCheck className="size-[18px] shrink-0 text-trust" aria-hidden />
                <p className="text-center text-[0.875rem] text-trust">{data.paymentSafetyNote}</p>
              </div>
            )}
          </div>
        </section>

        {data.faq.length > 0 && (
          <section className="bt-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
            <CanvasHeading title={t("pricing.faqTitle", "Aksar poochhe jaane wale sawaal")} />
            <div className="mx-auto mt-10 max-w-2xl">
              <FaqAccordion items={data.faq} />
            </div>
          </section>
        )}

        {data.finalCTA.href && (
          <section className="bt-shell bt-shell--cream bt-shell--foil px-6 py-14 text-center sm:px-12 sm:py-16">
            <LeafSpray className="bt-vine bt-vine--soft -bottom-16 -left-14 h-[280px] w-[168px]" />
            <LeafSpray flip className="bt-vine bt-vine--soft -bottom-16 -right-14 h-[280px] w-[168px]" />

            <div className="relative mx-auto max-w-xl">
              <h2 className="bt-display text-[1.85rem] sm:text-[2.35rem]">
                {t("pricing.finalCtaTitle", "Shuruaat free hai")}
              </h2>
              <div className="bt-rule mx-auto mt-4 max-w-[240px]">
                <RuleMotif />
              </div>
              <p className="mx-auto mt-4 max-w-md text-[0.9375rem] leading-relaxed text-muted">
                {t(
                  "pricing.finalCtaDescription",
                  "Profile banane ke liye koi payment nahi. Plan tab lijiye jab aapko lage ki zaroorat hai.",
                )}
              </p>
              <Link
                href={data.finalCTA.href}
                className="bt-cta mt-8 inline-flex h-12 items-center justify-center rounded-full px-8 text-[0.9375rem] font-semibold transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {data.finalCTA.label}
              </Link>
            </div>
          </section>
        )}
      </Container>
    </main>
  );
}
