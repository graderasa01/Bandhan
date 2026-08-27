import Link from "next/link";
import {
  BadgeCheck,
  CreditCard,
  Handshake,
  LifeBuoy,
  Lock,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { SafetyPageViewModel } from "@/lib/contracts/publicPages";
import { getT } from "@/lib/i18n/server";
import { Container } from "@/components/ui/Container";
import { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import CanvasHeading from "@/components/public/_shared/CanvasHeading";
import { LeafSpray } from "@/components/public/_shared/Ornaments";

type Props = { data: SafetyPageViewModel };

/** The vocabulary `mockSafetyPageData` actually ships; Sparkles is the fallback. */
const SECTION_ICON: Record<string, LucideIcon> = {
  privacy: Lock,
  verified: BadgeCheck,
  ai: Sparkles,
  partner: Handshake,
  payment: CreditCard,
};

export default async function SafetyPageView({ data }: Props) {
  const t = await getT();
  return (
    <main>
      <Container size="wide" className="flex flex-col gap-5 pb-16 pt-4 sm:gap-7 sm:pb-20 sm:pt-6">
        {/* Wine, like the home page's safety panel. This is the one page where
            the promise is the product, and a cream panel says "another
            section" where this needs to say "stop and read". */}
        <section className="bt-shell bt-shell--deep px-6 py-14 text-center sm:px-10 sm:py-16">
          <LeafSpray className="bt-vine -left-12 -top-14 h-[260px] w-[156px] sm:-left-14 sm:h-[340px] sm:w-[204px]" />
          <LeafSpray
            flip
            className="bt-vine bt-vine--soft -right-12 -top-14 hidden h-[320px] w-[192px] lg:block"
          />

          <CanvasHeading
            as="h1"
            size="lg"
            eyebrow={t("safety.eyebrow", "Safety")}
            eyebrowIcon={ShieldCheck}
            title={t("safety.hero.title", "Safety & Trust")}
            description={t(
              "safety.hero.description",
              "BandhanTak par aapki safety aur privacy hamari priority hai.",
            )}
            className="relative"
          />
        </section>

        <section className="bt-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <RevealGroup className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
            {data.sections.map((sec) => {
              const Icon = SECTION_ICON[sec.icon ?? ""] ?? Sparkles;
              return (
                <RevealItem key={sec.title}>
                  <div className="bt-card h-full p-6">
                    <span className="bt-ring bt-ring--trust [--paper-ring-size:2.75rem]">
                      <Icon className="size-[18px]" />
                    </span>
                    <h2 className="bt-display mt-4 text-[1.15rem] leading-snug">{sec.title}</h2>
                    <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
                      {sec.content}
                    </p>
                  </div>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </section>

        {data.report && (
          <section className="bt-shell bt-shell--cream bt-shell--foil px-6 py-12 text-center sm:px-12 sm:py-14">
            <LeafSpray className="bt-vine bt-vine--soft -bottom-16 -left-14 h-[260px] w-[156px]" />

            <div className="relative mx-auto max-w-xl">
              <span className="bt-ring bt-ring--blush mx-auto [--paper-ring-size:3.25rem]">
                <LifeBuoy className="size-6" />
              </span>
              <h2 className="bt-display mt-5 text-[1.6rem] sm:text-[2rem]">
                {data.report.headline}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted">
                {data.report.description}
              </p>
              {data.report.cta.href && (
                <Link
                  href={data.report.cta.href}
                  className="bt-cta-ghost mt-7 inline-flex h-12 items-center justify-center rounded-full px-7 text-[0.9375rem] font-semibold transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  {data.report.cta.label}
                </Link>
              )}
            </div>
          </section>
        )}
      </Container>
    </main>
  );
}
