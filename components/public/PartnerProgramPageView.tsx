import {
  Banknote,
  Building2,
  Camera,
  CheckCircle2,
  Flame,
  Handshake,
  HeartHandshake,
  LayoutDashboard,
  Link2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { PartnerProgramViewModel } from "@/lib/contracts/publicPages";
import { getT } from "@/lib/i18n/server";
import { Container } from "@/components/ui/Container";
import Reveal, { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { CTALink } from "@/components/ui/_shared/CTALink";
import CanvasHeading from "@/components/public/_shared/CanvasHeading";
import { LeafSpray, RuleMotif } from "@/components/public/_shared/Ornaments";

type Props = { data: PartnerProgramViewModel };

const PARTNER_TYPE_ICONS: Record<string, typeof Flame> = {
  pandit: Flame,
  bureau: Building2,
  consultant: UserCheck,
  coordinator: Users,
  family: HeartHandshake,
  vendor: Camera,
  other: Sparkles,
};

const BENEFIT_ICONS: Record<string, typeof Link2> = {
  link: Link2,
  dashboard: LayoutDashboard,
  commission: Wallet,
  ai: Sparkles,
  payout: Banknote,
};

export default async function PartnerProgramPageView({ data }: Props) {
  const t = await getT();
  const {
    hero,
    whoCanBecome,
    howItWorks,
    benefits,
    commissionTransparency,
    approvalProcess,
    trustAndPrivacy,
    faq,
    finalCTA,
  } = data;

  return (
    <main>
      <Container size="wide" className="flex flex-col gap-5 pb-16 pt-4 sm:gap-7 sm:pb-20 sm:pt-6">
        {/* Hero */}
        <section className="pc-shell pc-shell--cream pc-shell--foil px-6 py-14 text-center sm:px-10 sm:py-16">
          <LeafSpray className="pc-vine -left-12 -top-14 h-[240px] w-[144px] sm:-left-14 sm:-top-16 sm:h-[320px] sm:w-[192px]" />
          <LeafSpray
            flip
            className="pc-vine pc-vine--soft -right-12 -top-14 hidden h-[300px] w-[180px] lg:block"
          />

          <div className="relative">
            <CanvasHeading
              as="h1"
              size="lg"
              eyebrow={t("partnerProgram.hero.badge", "Partner network")}
              eyebrowIcon={Handshake}
              title={hero.headline}
              description={hero.description}
            />
            <div className="mt-8">
              <CTALink href={hero.cta.href} className="pc-cta">
                {hero.cta.label}
              </CTALink>
            </div>
          </div>
        </section>

        {/* Who can become one */}
        <section className="pc-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <CanvasHeading
            eyebrow={t("partnerProgram.whoCanJoin.eyebrow", "Kaun ban sakta hai")}
            title={whoCanBecome.headline}
            description={whoCanBecome.description}
          />

          <RevealGroup className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {whoCanBecome.types.map((type) => {
              const Icon = PARTNER_TYPE_ICONS[type.id] ?? Sparkles;
              return (
                <RevealItem key={type.id}>
                  <div className="pc-card h-full p-5">
                    <span className="pc-ring [--pc-ring-size:2.5rem]">
                      <Icon className="size-[18px]" />
                    </span>
                    <h3 className="pc-display mt-3.5 text-[1.0625rem] leading-snug">
                      {type.title}
                    </h3>
                    <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">
                      {type.description}
                    </p>
                  </div>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </section>

        {/* Six steps */}
        <section className="pc-shell pc-shell--cream px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <LeafSpray className="pc-vine pc-vine--soft -bottom-20 -left-14 hidden h-[300px] w-[180px] lg:block" />

          <div className="relative">
            <CanvasHeading
              eyebrow={t("partnerProgram.process.eyebrow", "Process")}
              title={t("partnerProgram.process.title", "Kaise kaam karta hai")}
              description={t(
                "partnerProgram.process.description",
                "Register se commission tak, chhe seedhe steps.",
              )}
            />

            <RevealGroup className="relative mt-12 grid grid-cols-2 gap-x-5 gap-y-9 lg:grid-cols-3 lg:gap-8">
              {howItWorks.map((s) => (
                <RevealItem key={s.step}>
                  <span className="pc-step">{String(s.step).padStart(2, "0")}</span>
                  <h3 className="pc-display mt-4 text-[1.05rem] leading-snug lg:text-[1.15rem]">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
                    {s.description}
                  </p>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* Benefits */}
        <section className="pc-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <CanvasHeading
            eyebrow={t("partnerProgram.benefits.eyebrow", "Partner tools")}
            title={t("partnerProgram.benefits.title", "Partner Benefits")}
          />

          <RevealGroup className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {benefits.map((b, i) => {
              const Icon = BENEFIT_ICONS[b.icon ?? ""] ?? Sparkles;
              return (
                <RevealItem key={i}>
                  <div className="pc-card h-full p-5">
                    <span className="pc-ring pc-ring--trust [--pc-ring-size:2.5rem]">
                      <Icon className="size-[18px]" />
                    </span>
                    <h3 className="pc-display mt-3.5 text-[1.0625rem] leading-snug">{b.title}</h3>
                    <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">
                      {b.description}
                    </p>
                  </div>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </section>

        {/* What one referral actually pays */}
        <section className="pc-shell pc-shell--blush px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <LeafSpray flip className="pc-vine -right-14 -top-12 h-[320px] w-[192px]" />

          <div className="relative">
            <CanvasHeading
              eyebrow={t("partnerProgram.commission.eyebrow", "Saaf-saaf")}
              title={commissionTransparency.headline}
              description={commissionTransparency.description}
            />

            <Reveal delay={0.1}>
              <div className="pc-card mx-auto mt-10 max-w-sm p-7 text-center">
                <p className="pc-microlabel">{commissionTransparency.example.plan}</p>
                <p className="pc-numeral mt-2.5 text-[2.4rem]">
                  {commissionTransparency.example.commission}
                </p>

                <ul className="mt-6 space-y-2.5 border-t border-line pt-6 text-left">
                  {commissionTransparency.notes.map((note, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-[0.875rem] leading-snug text-ink"
                    >
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-trust" />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Approval */}
        <section className="pc-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <CanvasHeading title={approvalProcess.headline} description={approvalProcess.description} />

          <Reveal delay={0.1}>
            <ol className="mx-auto mt-10 max-w-md space-y-3">
              {approvalProcess.steps.map((s, i) => (
                <li key={i} className="pc-card flex items-start gap-3.5 p-4">
                  <span className="pc-ring [--pc-ring-size:1.875rem] text-[0.8125rem] font-semibold">
                    {i + 1}
                  </span>
                  <span className="pt-1 text-[0.9375rem] leading-snug text-ink">{s}</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* Trust and privacy — the same wine panel the home page gives users,
            so partners get the same reassurance moment rather than a plain
            white block. */}
        <section className="pc-shell pc-shell--deep px-6 py-12 sm:px-10 sm:py-16 lg:px-14">
          <LeafSpray flip className="pc-vine -right-12 -top-14 h-[320px] w-[192px]" />

          <div className="relative grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
            <div>
              <span className="pc-eyebrow pc-eyebrow--caps">
                <ShieldCheck className="size-3.5" />
                {t("partnerProgram.trust.badge", "Trust & Privacy")}
              </span>
              <h2 className="pc-display mt-5 text-[1.85rem] sm:text-[2.35rem]">
                {trustAndPrivacy.headline}
              </h2>
              <div className="pc-rule mt-4 max-w-[280px]">
                <RuleMotif />
              </div>
            </div>

            <RevealGroup className="grid gap-3.5">
              {trustAndPrivacy.points.map((point, i) => (
                <RevealItem key={i}>
                  <div className="pc-card flex items-start gap-4 p-5 transition-colors hover:bg-surface-2">
                    <span className="pc-ring [--pc-ring-size:2.5rem]">
                      <ShieldCheck className="size-[18px]" />
                    </span>
                    <p className="text-[0.9375rem] leading-relaxed text-muted">{point}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* FAQ */}
        <section className="pc-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <CanvasHeading title={t("partnerProgram.faq.title", "Frequently Asked Questions")} />

          <RevealGroup className="mx-auto mt-10 max-w-2xl space-y-3">
            {faq.map((item, i) => (
              <RevealItem key={i}>
                <div className="pc-card p-5">
                  <p className="text-[0.9375rem] font-semibold text-ink">{item.q}</p>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">{item.a}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        {/* Final CTA */}
        <section className="pc-shell pc-shell--cream pc-shell--foil px-6 py-14 text-center sm:px-12 sm:py-16">
          <LeafSpray className="pc-vine pc-vine--soft -bottom-16 -left-14 h-[280px] w-[168px]" />
          <LeafSpray flip className="pc-vine pc-vine--soft -bottom-16 -right-14 h-[280px] w-[168px]" />

          <Reveal className="relative mx-auto max-w-xl">
            <span className="pc-eyebrow pc-eyebrow--caps">
              <Sparkles className="size-3.5" />
              {t("partnerProgram.finalCta.badge", "Shuru kijiye")}
            </span>
            <h2 className="pc-display mt-6 text-[1.9rem] sm:text-[2.45rem]">
              {t("partnerProgram.finalCta.title", "Partner Banein Aur Commission Earn Karein")}
            </h2>
            <div className="pc-rule mx-auto mt-4 max-w-[240px]">
              <RuleMotif />
            </div>
            <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted">
              {t(
                "partnerProgram.finalCta.description",
                "Verified partner network join karein aur genuine members refer kar ke commission earn karein.",
              )}
            </p>
            <div className="mt-8">
              <CTALink href={finalCTA.href} className="pc-cta">
                {finalCTA.label}
              </CTALink>
            </div>
          </Reveal>
        </section>
      </Container>
    </main>
  );
}
