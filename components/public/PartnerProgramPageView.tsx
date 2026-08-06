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
import { Container, Section, SectionHeading } from "@/components/ui/Container";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Reveal, { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { CTALink } from "@/components/ui/_shared/CTALink";

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

export default function PartnerProgramPageView({ data }: Props) {
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
      {/* Hero */}
      <Section className="!pb-10 !pt-10 sm:!pt-14">
        <Container size="narrow">
          <div className="flex flex-col items-center text-center">
            <Pill tone="gold" className="mb-5">
              <Handshake />
              Partner network
            </Pill>
            <h1 className="text-balance text-[2rem] leading-[1.15] tracking-tight text-wine-700 sm:text-[2.5rem] sm:leading-[1.12]">
              {hero.headline}
            </h1>
            <p className="mt-5 max-w-lg text-pretty leading-relaxed text-muted sm:text-lg">
              {hero.description}
            </p>
            <div className="mt-8">
              <CTALink href={hero.cta.href}>{hero.cta.label}</CTALink>
            </div>
          </div>
        </Container>
      </Section>

      {/* Who Can Become */}
      <Section className="!pt-6">
        <Container size="wide">
          <SectionHeading eyebrow="Kaun ban sakta hai" title={whoCanBecome.headline} description={whoCanBecome.description} />

          <RevealGroup className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {whoCanBecome.types.map((t) => {
              const Icon = PARTNER_TYPE_ICONS[t.id] ?? Sparkles;
              return (
                <RevealItem key={t.id}>
                  <Card variant="soft" padding="md" className="h-full">
                    <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-gold-100 to-gold-200/50 text-primary-text dark:from-gold-900/60 dark:to-gold-800/30">
                      <Icon className="size-[18px]" />
                    </span>
                    <h3 className="mt-3 text-[0.9375rem] font-semibold leading-snug text-ink">{t.title}</h3>
                    <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{t.description}</p>
                  </Card>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </Container>
      </Section>

      {/* How It Works */}
      <Section tone="subtle">
        <Container size="wide">
          <SectionHeading eyebrow="Process" title="Kaise kaam karta hai" description="Register se commission tak, chhe seedhe steps." />

          <RevealGroup className="relative mt-12 grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-3 lg:gap-6">
            {howItWorks.map((s) => (
              <RevealItem key={s.step}>
                <span className="grid size-10 place-items-center rounded-full border border-gold-300 bg-surface font-[family-name:var(--font-display)] text-base text-primary-text shadow-sm lg:size-12 lg:text-lg">
                  {String(s.step).padStart(2, "0")}
                </span>
                <h3 className="mt-4 text-base leading-snug">{s.title}</h3>
                <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">{s.description}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </Container>
      </Section>

      {/* Benefits */}
      <Section>
        <Container size="wide">
          <SectionHeading eyebrow="Partner tools" title="Partner Benefits" />

          <RevealGroup className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {benefits.map((b, i) => {
              const Icon = BENEFIT_ICONS[b.icon ?? ""] ?? Sparkles;
              return (
                <RevealItem key={i}>
                  <Card variant="default" padding="md" className="h-full">
                    <span className="grid size-10 place-items-center rounded-full bg-trust-bg text-trust">
                      <Icon className="size-[18px]" />
                    </span>
                    <h3 className="mt-3 text-[0.9375rem] font-semibold leading-snug text-ink">{b.title}</h3>
                    <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{b.description}</p>
                  </Card>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </Container>
      </Section>

      {/* Commission Transparency */}
      <Section tone="subtle">
        <Container size="narrow">
          <SectionHeading
            eyebrow="Saaf-saaf"
            title={commissionTransparency.headline}
            description={commissionTransparency.description}
          />

          <Reveal delay={0.1}>
            <Card variant="elevated" padding="xl" className="mx-auto mt-10 max-w-sm text-center">
              <p className="text-[0.8125rem] font-medium text-muted">{commissionTransparency.example.plan}</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold leading-none text-wine-700">
                {commissionTransparency.example.commission}
              </p>

              <ul className="mt-6 space-y-2.5 border-t border-line pt-6 text-left">
                {commissionTransparency.notes.map((note, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[0.875rem] leading-snug text-ink">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-trust" />
                    {note}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        </Container>
      </Section>

      {/* Approval Process */}
      <Section>
        <Container size="narrow">
          <SectionHeading title={approvalProcess.headline} description={approvalProcess.description} />

          <Reveal delay={0.1}>
            <ol className="mx-auto mt-10 max-w-md space-y-3">
              {approvalProcess.steps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-xs"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold-100 text-[0.8125rem] font-bold text-primary-text dark:bg-gold-900/50">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-[0.9375rem] leading-snug text-ink">{s}</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </Container>
      </Section>

      {/* Trust and Privacy — same "on deep" treatment as the homepage's
          Safety section, so partners get the same premium reassurance
          moment users do rather than another plain white block. */}
      <Section tone="deep">
        <Container size="wide">
          <div className="relative grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
            <div>
              <Pill tone="onDeep">
                <ShieldCheck className="text-gold-300" />
                Trust &amp; Privacy
              </Pill>
              <h2 className="mt-5 text-3xl leading-tight text-white sm:text-4xl">{trustAndPrivacy.headline}</h2>
            </div>

            <RevealGroup className="grid gap-3.5">
              {trustAndPrivacy.points.map((point, i) => (
                <RevealItem key={i}>
                  <div className="flex items-start gap-4 rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.09]">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-400/15 text-gold-300">
                      <ShieldCheck className="size-4" />
                    </span>
                    <p className="text-[0.9375rem] leading-relaxed text-white/80">{point}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section>
        <Container size="narrow">
          <SectionHeading title="Frequently Asked Questions" />

          <RevealGroup className="mx-auto mt-10 max-w-2xl space-y-3">
            {faq.map((item, i) => (
              <RevealItem key={i}>
                <Card variant="outlined" padding="md">
                  <p className="text-[0.9375rem] font-semibold text-ink">{item.q}</p>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">{item.a}</p>
                </Card>
              </RevealItem>
            ))}
          </RevealGroup>
        </Container>
      </Section>

      {/* Final CTA — mirrors the homepage's closing card */}
      <Section className="!pb-20 !pt-4 sm:!pb-24">
        <Container size="wide">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl border border-gold-300 bg-gradient-to-br from-gold-50 via-surface to-trust-bg px-6 py-16 text-center dark:from-gold-900/30 dark:via-surface dark:to-trust-bg sm:px-12 sm:py-20">
              <div
                aria-hidden
                className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-gold-300/30 blur-3xl"
              />
              <div className="relative mx-auto max-w-xl">
                <Pill tone="gold">
                  <Sparkles />
                  Shuru kijiye
                </Pill>
                <h2 className="mt-6 text-balance text-3xl leading-tight sm:text-[2.4rem]">
                  Partner Banein Aur Commission Earn Karein
                </h2>
                <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted sm:text-lg">
                  Verified partner network join karein aur genuine members refer kar ke commission earn karein.
                </p>
                <div className="mt-8">
                  <CTALink href={finalCTA.href}>{finalCTA.label}</CTALink>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>
    </main>
  );
}
