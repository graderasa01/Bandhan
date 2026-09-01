import Link from "next/link";
import { Route } from "lucide-react";
import type { HowItWorksViewModel } from "@/lib/contracts/publicPages";
import { getT } from "@/lib/i18n/server";
import { Container } from "@/components/ui/Container";
import Reveal, { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import CanvasHeading from "@/components/public/_shared/CanvasHeading";
import { LeafSpray, RuleMotif } from "@/components/public/_shared/Ornaments";

type Props = { data: HowItWorksViewModel };

/**
 * The journey page, on the marketing skin.
 *
 * Was hand-rolled inline styles against the pre-v2 `--color-*` aliases — a
 * numbered circle, a card, and a literal "↓" between each pair. The steps are
 * now strung on the same dotted gold thread the home page's journey strip
 * uses, so the two pages tell one story instead of two.
 */
export default async function HowItWorksPageView({ data }: Props) {
  const t = await getT();
  return (
    <main>
      <Container size="wide" className="flex flex-col gap-5 pb-16 pt-4 sm:gap-7 sm:pb-20 sm:pt-6">
        <section className="bt-shell bt-shell--cream bt-shell--foil px-6 py-14 text-center sm:px-10 sm:py-16">
          <LeafSpray className="bt-vine -left-12 -top-14 h-[240px] w-[144px] sm:-left-14 sm:-top-16 sm:h-[320px] sm:w-[192px]" />
          <LeafSpray
            flip
            className="bt-vine bt-vine--soft -right-12 -top-14 hidden h-[300px] w-[180px] lg:block"
          />

          <CanvasHeading
            as="h1"
            size="lg"
            eyebrow={t("howItWorks.eyebrow", "Journey")}
            eyebrowIcon={Route}
            title={data.hero.headline}
            description={data.hero.description}
            className="relative"
          />
        </section>

        <section className="bt-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          {/* One column, not a four-up grid: these steps happen in order and a
              row of equal cards says they don't. The thread runs down the
              gutter the step markers sit in. */}
          <RevealGroup className="relative mx-auto max-w-2xl">
            <div
              aria-hidden
              className="bt-thread bt-thread--v absolute bottom-8 left-[1.375rem] top-8"
            />

            {data.steps.map((step) => (
              <RevealItem key={step.step} className="relative flex gap-5 pb-8 last:pb-0">
                <span className="bt-step relative z-10 shrink-0">
                  {String(step.step).padStart(2, "0")}
                </span>
                <div className="bt-card min-w-0 flex-1 p-5">
                  <h2 className="bt-display text-[1.15rem] leading-snug">{step.title}</h2>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
                    {step.description}
                  </p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        <section className="bt-shell bt-shell--cream bt-shell--foil px-6 py-14 text-center sm:px-12 sm:py-16">
          <LeafSpray className="bt-vine bt-vine--soft -bottom-16 -left-14 h-[280px] w-[168px]" />
          <LeafSpray flip className="bt-vine bt-vine--soft -bottom-16 -right-14 h-[280px] w-[168px]" />

          <Reveal className="relative mx-auto max-w-xl">
            <h2 className="bt-display text-[1.85rem] sm:text-[2.35rem]">
              {t("howItWorks.finalCtaTitle", "Pehla step aaj hi le lijiye")}
            </h2>
            <div className="bt-rule mx-auto mt-4 max-w-[240px]">
              <RuleMotif />
            </div>
            {data.finalCTA.href && (
              <Link
                href={data.finalCTA.href}
                className="bt-cta mt-8 inline-flex h-12 items-center justify-center rounded-full px-8 text-[0.9375rem] font-semibold transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {data.finalCTA.label}
              </Link>
            )}
          </Reveal>
        </section>
      </Container>
    </main>
  );
}
