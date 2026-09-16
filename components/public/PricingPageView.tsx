import Link from "next/link";
import { BadgeCheck, CalendarCheck, Inbox, Lock, MessageCircle, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import type { PricingPageViewModel } from "@/lib/contracts/publicPages";
import { getT } from "@/lib/i18n/server";
import { Container } from "@/components/ui/Container";
import Card from "@/components/ui/Card";
import PlanCard from "@/components/subscription/PlanCard";
import PlanComparisonTable from "@/components/subscription/PlanComparisonTable";
import FaqAccordion from "@/components/public/FaqAccordion";
import CanvasHeading from "@/components/public/_shared/CanvasHeading";
import { LeafSpray, RuleMotif } from "@/components/public/_shared/Ornaments";

type Props = { data: PricingPageViewModel };

/**
 * D-90 — "paisa sahi pal par". The page reads in the order the model works:
 * what is free (all of finding someone), then the only places money is asked
 * for, then the promises.
 *
 * Every promise here is a rule the code enforces today. Three that used to be
 * on this page were not, and were removed rather than reworded: a renewal
 * reminder with no scheduler behind it, a GST invoice nothing generates, and
 * "cancel in 2 taps" — there is no auto-renew, so there was nothing to cancel.
 */
export default async function PricingPageView({ data }: Props) {
  const t = await getT();
  const unlock = data.chatUnlock;
  const signUpHref = data.finalCTA.href ?? "/register";

  const unlockLines = unlock
    ? [
        t("pricing.unlock.line.mutual", "Sirf mutual match par — jab dono ne haan kaha ho"),
        t("pricing.unlock.line.both", "Ek unlock me chat aap dono ke liye khulti hai"),
        t("pricing.unlock.line.refund", "Aapne likha, par {hours} ghante me jawab nahi aaya — to unlock wapas").replace(
          "{hours}",
          String(unlock.guaranteeHours),
        ),
        t("pricing.unlock.line.refundCap", "Wapsi {days} din me {cap} baar tak — credit ke roop me, cash nahi")
          .replace("{days}", String(unlock.refundWindowDays))
          .replace("{cap}", String(unlock.refundCap)),
        t("pricing.unlock.line.contact", "Phone number share chat khulne ke baad hi"),
        t("pricing.unlock.line.partner", "Approved partner ke code se jude hain to pehla unlock free"),
      ]
    : [];

  const promises = [
    { icon: Inbox, text: t("pricing.promise.interestsFree", "Aane wale interest ka kabhi paisa nahi") },
    {
      icon: CalendarCheck,
      text: t("pricing.promise.noAutoRenew", "Koi auto-renew nahi — bina aapke kahe dobara paisa nahi katega"),
    },
    ...(unlock
      ? [
          {
            icon: RotateCcw,
            text: t("pricing.promise.noReply", "Chat kholi, {hours} ghante jawab nahi aaya — unlock wapas").replace(
              "{hours}",
              String(unlock.guaranteeHours),
            ),
          },
        ]
      : []),
    {
      icon: Sparkles,
      text: t("pricing.promise.noPaidRanking", "Ranking khareedi nahi ja sakti — Boost sirf kamaya jaata hai"),
    },
    {
      icon: ShieldCheck,
      text: t("pricing.promise.badges", "Koi badge seedha khareeda nahi ja sakta — sirf asli check se milta hai"),
    },
    { icon: Lock, text: t("pricing.promise.card", "Card details kabhi store nahi hoti") },
  ];

  return (
    <main>
      <Container size="wide" className="flex flex-col gap-5 pb-16 pt-4 sm:gap-7 sm:pb-20 sm:pt-6">
        {/* 1 · What is free — first, because it is most of the product. The
            list is built from the live FREE plan, so it cannot promise more
            than a member actually gets. */}
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

            {data.freeList.length > 0 && (
              <div className="bt-card mx-auto mt-10 max-w-3xl p-6 sm:p-8">
                <p className="bt-microlabel">{t("pricing.freeTitle", "Hamesha free")}</p>
                <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  {data.freeList.map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug text-ink">
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-line pt-4 text-[0.8125rem] text-muted">
                  {t("pricing.freeFootnote", "Koi card nahi, koi trial nahi — ye sab hamesha free hai.")}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 2 · The only places money is asked for. */}
        <section className="bt-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <CanvasHeading
            title={t("pricing.paidTitle", "Paisa sirf yahan")}
            description={t(
              "pricing.paidDescription",
              "Tab, jab kisi rishte se baat shuru karni ho — ya kisi insaan ki madad chahiye.",
            )}
          />

          {/* pt-4: PlanCard hangs its badge above its own top edge, and this
              panel clips its overflow. */}
          <div className="mt-10 grid grid-cols-1 gap-6 pt-4 lg:grid-cols-3">
            {unlock && (
              <Card padding="lg" className="flex h-full flex-col">
                <p className="text-lg font-semibold text-ink">{t("pricing.unlock.title", "Chat Unlock")}</p>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-display)] text-4xl leading-none text-ink">
                    {unlock.priceDisplay}
                  </span>
                  <span className="text-[0.875rem] text-muted">{t("pricing.unlock.per", "/ ek rishta")}</span>
                </div>
                <p className="mt-3 text-[0.8125rem] text-muted">
                  {t("pricing.unlock.lead", "Ek baar ka — koi mahina, koi renewal nahi.")}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 border-t border-line pt-6">
                  {unlockLines.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-[0.8125rem] text-ink">
                      <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 flex items-start gap-2 rounded-lg bg-bg-subtle p-3 text-[0.75rem] leading-snug text-muted">
                  <MessageCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t(
                    "pricing.unlock.where",
                    "Match hone ke baad usi chat me khulta hai — pehle se kuch kharidna nahi padta.",
                  )}
                </p>
              </Card>
            )}

            {data.plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} ctaHref={signUpHref} t={t} />
            ))}

            <Card padding="lg" className="flex h-full flex-col">
              <p className="text-lg font-semibold text-ink">{t("pricing.partner.title", "Insaan ki madad")}</p>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-muted">
                {t(
                  "pricing.partner.body",
                  "Pandit ji, marriage bureau aur rishta consultant — admin se approve hue partners ki services. Har service ka daam uske page par likha hai.",
                )}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5 border-t border-line pt-6">
                {[
                  t("pricing.partner.line.services", "Intro call, profile setup, curated shortlist"),
                  t("pricing.partner.line.coordination", "Ghar walon aur mulaqaat ka taalmel"),
                  t("pricing.partner.line.held", "Aapka paisa service poori hone tak hold rehta hai"),
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2 text-[0.8125rem] text-ink">
                    <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/partners"
                className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full border border-line-strong bg-surface px-6 text-[0.9375rem] font-semibold text-ink transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-500 hover:bg-gold-50 focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg dark:hover:bg-gold-900/30"
              >
                {t("pricing.partner.cta", "Find a Partner")}
              </Link>
            </Card>
          </div>
        </section>

        {data.comparisonPlans.length > 1 && (
          <section className="bt-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
            <CanvasHeading
              title={t("pricing.comparisonTitle", "Free aur Pass — saath rakh kar")}
              description={t("pricing.comparisonDescription", "Poori tulna — koi chhupi limit nahi.")}
            />
            {/* The table carries its own overflow-x, which it has to: this
                panel clips, and the table is wider than a phone. */}
            <div className="mt-10">
              <PlanComparisonTable plans={data.comparisonPlans} recommendedCode="PASS" />
            </div>
          </section>
        )}

        <section className="bt-shell bt-shell--cream px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <div className="mx-auto max-w-3xl">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {promises.map((p) => (
                <div key={p.text} className="bt-card flex items-start gap-3.5 p-5">
                  <span className="bt-ring bt-ring--trust [--paper-ring-size:2.25rem]">
                    <p.icon className="size-[17px]" aria-hidden />
                  </span>
                  <span className="pt-1.5 text-[0.875rem] leading-snug text-ink">{p.text}</span>
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
                  "Profile banane, rishtey dekhne aur interest bhejne ke liye koi payment nahi. Paisa tab, jab kisi se baat shuru karni ho.",
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
