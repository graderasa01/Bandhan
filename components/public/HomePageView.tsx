import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Eye,
  FileUp,
  Fingerprint,
  Handshake,
  Lock,
  Mic,
  PencilLine,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { HomePageViewModel } from "@/lib/contracts/publicPages";
import { Container, Eyebrow, Section, SectionHeading } from "@/components/ui/Container";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import CountUp from "@/components/ui/CountUp";
import ProgressRing from "@/components/ui/ProgressRing";
import Reveal, { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import SnapRail from "@/components/ui/SnapRail";
import HeroFillPreview from "@/components/public/home/HeroFillPreview";
import ReelPreview from "@/components/public/home/ReelPreview";
import { cn } from "@/lib/utils";

type Props = { data: HomePageViewModel };

/* ------------------------------------------------------------------ */

function CTALink({
  href,
  children,
  variant = "primary",
  className,
}: {
  /** UIAction.href is optional in the contract — no link, no CTA. */
  href?: string;
  children: ReactNode;
  variant?: "primary" | "onDeep" | "ghostDeep" | "secondary";
  className?: string;
}) {
  if (!href) return null;

  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[0.9375rem] font-semibold",
        "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2",
        variant === "primary" &&
          "bg-primary text-primary-fg shadow-md hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-gold focus-visible:ring-offset-bg",
        variant === "secondary" &&
          "border border-line-strong bg-surface text-ink hover:-translate-y-0.5 hover:border-gold-500 hover:bg-gold-50 focus-visible:ring-offset-bg dark:hover:bg-gold-900/30",
        // "Deep" here means "on the hero" specifically, not "on a dark
        // ground" — Kaagaz's hero pack flips light (D-21b), so these read
        // named hero-* tokens rather than hardcoding white/wine.
        variant === "onDeep" &&
          "bg-gradient-to-b from-gold-300 to-gold-500 text-wine-800 shadow-gold hover:-translate-y-0.5 hover:brightness-105 focus-visible:ring-offset-hero-ring-offset",
        variant === "ghostDeep" &&
          "border border-hero-border text-hero-fg hover:-translate-y-0.5 hover:border-hero-fg-muted hover:bg-hero-chip-bg focus-visible:ring-offset-hero-ring-offset",
        className,
      )}
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* 1 · Hero                                                            */
/* ------------------------------------------------------------------ */

const HERO_PROOF = [
  { icon: Mic, label: "Bol kar profile" },
  { icon: BadgeCheck, label: "7-level verification" },
  { icon: Lock, label: "Privacy-first" },
  { icon: Handshake, label: "Approved partners only" },
];

function Hero({ data }: { data: HomePageViewModel["hero"] }) {
  return (
    <section className="pt-5 sm:pt-7">
      <Container size="wide">
        {/* bg-grad-hero reads the active theme pack (D-21b) instead of a
            hardcoded gradient — Raat/Kaagaz each carry their own mood. */}
        <div className="spotlight grain relative overflow-hidden rounded-2xl bg-grad-hero px-6 py-14 sm:px-10 sm:py-18 lg:px-14 lg:py-22">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent"
          />

          {/* min-w-0 on both cells: grid items default to min-width:auto, so
              anything that outgrows its column drags the whole hero wider
              rather than being contained by it. */}
          <div className="relative grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
            <div className="min-w-0 max-w-xl lg:max-w-2xl">
              {/* Custom className, not tone="onDeep" — that tone hardcodes
                  white for a permanently-dark ground; the hero's own ground
                  flips light under Kaagaz (D-21b). */}
              <Pill
                tone="neutral"
                className="mb-6 border-hero-border bg-hero-chip-bg text-hero-fg backdrop-blur-sm"
              >
                <Sparkles className="text-hero-icon" />
                India ka AI-guided matrimony
              </Pill>

              <h1 className="text-balance text-[2.15rem] leading-[1.22] tracking-tight text-hero-fg sm:text-[2.75rem] sm:leading-[1.16] lg:text-[3.25rem] lg:leading-[1.12]">
                Rishta wahi jisme <span className="text-foil">bharosa</span> pehle dikhe.
              </h1>

              <p className="mt-6 max-w-md text-pretty leading-relaxed text-hero-fg-muted sm:text-lg">
                {data.subheadline}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <CTALink href={data.primaryCTA.href} variant="onDeep">
                  {data.primaryCTA.label}
                </CTALink>
                <CTALink href={data.secondaryCTA.href} variant="ghostDeep">
                  {data.secondaryCTA.label}
                </CTALink>
              </div>

              <ul className="mt-9 grid grid-cols-2 gap-x-5 gap-y-3 sm:max-w-md">
                {HERO_PROOF.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-2.5 text-sm text-hero-fg-muted">
                    <Icon className="size-4 shrink-0 text-hero-icon" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            {/* The biodata-extraction demo is a desktop showcase piece — on
                phones it just added scroll length without adding proof the
                proof-point list below doesn't already carry. */}
            <div className="hidden min-w-0 lg:block lg:pl-4">
              <HeroFillPreview />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Capability strip                                                */
/* ------------------------------------------------------------------ */

/**
 * Capability claims, not user-count claims. master_plan §12 forbids fake trust
 * numbers, and we have no audited user figures to publish.
 */
const CAPABILITIES = [
  { value: 8, suffix: "", label: "Profile banane ke tarike", sub: "Bol kar · biodata · chat · manual" },
  { value: 7, suffix: "", label: "Verification levels", sub: "Mobile se video verify tak" },
  { value: 0, suffix: "", label: "Data AI khud banata hai", sub: "Missing hai to missing hi rahega" },
  { value: 100, suffix: "%", label: "Partners admin-approved", sub: "Self-approval possible hi nahi" },
];

function CapabilityStrip() {
  return (
    <Section className="!py-12 sm:!py-14">
      <Container size="wide">
        {/* Two-up on phones: four full-width rows of one number each is a lot of
            scroll for what is essentially a glance. */}
        <RevealGroup className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
          {CAPABILITIES.map((item) => (
            <RevealItem key={item.label} className="bg-surface p-4 sm:p-6">
              <p className="font-[family-name:var(--font-display)] text-3xl leading-none text-primary-text">
                <CountUp value={item.value} suffix={item.suffix} />
              </p>
              <p className="mt-2.5 text-sm font-semibold text-ink">{item.label}</p>
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{item.sub}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Rishta Reel — the core loop (D-02)                              */
/* ------------------------------------------------------------------ */

function RishtaReel() {
  return (
    <Section tone="subtle">
      <Container size="wide">
        <div className="grid gap-12 lg:grid-cols-[1fr_0.85fr] lg:items-center lg:gap-16">
          <Reveal>
            <Eyebrow>
              <CalendarCheck />
              Rishta Reel
            </Eyebrow>

            <h2 className="mt-4 text-3xl leading-tight sm:text-4xl">
              Roz <span className="text-primary-text">paanch</span> rishtey.
              <br />
              Hazaaron nahi.
            </h2>

            <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted sm:text-lg">
              Endless scrolling se thak jaate hain log. BandhanTak roz sirf kuch profiles
              dikhata hai — par har ek ke saath ye batata hai ki wo kyu chuni gayi.
            </p>

            <div className="mt-7 space-y-3">
              {[
                { t: "AI raat bhar kaam karta hai", d: "Subah aapke liye chuni hui profiles ready hoti hain" },
                { t: "Har match ka reason", d: "Kya match karta hai — aur kya check karna chahiye" },
                { t: "Family ko bhej sakte hain", d: "Ek swipe me profile parivaar ke paas" },
              ].map((row) => (
                <div key={row.t} className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 size-[18px] shrink-0 text-trust" />
                  <div>
                    <p className="text-[0.9375rem] font-semibold text-ink">{row.t}</p>
                    <p className="text-[0.875rem] leading-snug text-muted">{row.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <ReelPreview />
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 4 · Ways to build a profile                                         */
/* ------------------------------------------------------------------ */

const METHOD_ICONS = [Mic, FileUp, PencilLine];

function ProfileMethods({
  ai,
  biodata,
}: {
  ai: HomePageViewModel["aiProfileBuilder"];
  biodata: HomePageViewModel["biodataAutofill"];
}) {
  return (
    <Section>
      <Container size="wide">
        <SectionHeading
          eyebrow="Profile builder"
          title="Form bharne ki zaroorat nahi."
          description="Bol dijiye, ya biodata upload kar dijiye. AI baaki kaam karta hai — aap sirf check karke confirm kariye."
        />

        <SnapRail label="Profile banane ke tarike" className="mt-12">
          {ai.methods.map((method, i) => {
            const Icon = METHOD_ICONS[i] ?? Sparkles;
            return (
              <div key={method.title} className="h-full">
                <Card
                  variant={i === 0 ? "elevated" : "default"}
                  padding="lg"
                  className="group h-full hover:-translate-y-1 hover:border-gold-500 hover:shadow-lg"
                >
                  <span className="grid size-12 place-items-center rounded-md bg-gradient-to-br from-gold-100 to-gold-200/50 text-primary-text transition-colors group-hover:from-gold-200 dark:from-gold-900/60 dark:to-gold-800/30">
                    <Icon className="size-5" />
                  </span>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <h3 className="text-lg leading-snug">{method.title}</h3>
                    {i === 0 && <Pill tone="gold" size="sm">Sabse tez</Pill>}
                  </div>

                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
                    {method.description}
                  </p>
                </Card>
              </div>
            );
          })}
        </SnapRail>

        <Reveal delay={0.15}>
          <div className="mt-8 flex flex-col items-start gap-5 rounded-lg border border-gold-300 bg-gold-50 p-6 sm:flex-row sm:items-center sm:justify-between dark:border-gold-400/25 dark:bg-gold-900/25">
            <p className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-gold-800 dark:text-gold-100">
              <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary-text" />
              <span>
                <strong className="font-semibold">AI kabhi data invent nahi karta.</strong>{" "}
                Koi detail clear na ho to wo aapse poochega — apne aap bhar nahi dega.
              </span>
            </p>
            <CTALink href={biodata.cta.href}>{biodata.cta.label}</CTALink>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 5 · Trust ladder                                                    */
/* ------------------------------------------------------------------ */

const TRUST_LEVELS = [
  { label: "Mobile verified", done: true },
  { label: "Email verified", done: true },
  { label: "Photo · real person", done: true },
  { label: "Govt ID verified", done: true },
  { label: "Education verified", done: false },
  { label: "Employment verified", done: false },
];

function TrustSection({ verified }: { verified: HomePageViewModel["verifiedProfile"] }) {
  return (
    <Section tone="subtle">
      <Container size="wide">
        <Card variant="elevated" padding="xl">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <Eyebrow>
                <ShieldCheck />
                Trust &amp; verification
              </Eyebrow>

              <h2 className="mt-4 text-3xl leading-tight sm:text-4xl">{verified.headline}</h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted">{verified.description}</p>

              <ul className="mt-7 space-y-3.5">
                {verified.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 size-5 shrink-0 text-trust" />
                    <span className="text-[0.9375rem] leading-relaxed text-ink">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col items-center gap-5 rounded-lg bg-bg-subtle p-5 sm:gap-7 sm:p-7">
              <ProgressRing
                label="Trust Score"
                segments={[
                  { key: "verify", label: "Verification", value: 82, color: "#1f7a5a" },
                  { key: "complete", label: "Completeness", value: 91, color: "#c9a96e" },
                  { key: "activity", label: "Activity", value: 74, color: "#ddac51" },
                ]}
                size={152}
              />

              {/* Six full-width rows is a lot of phone scroll for six short
                  labels — they pair up fine until the column narrows at lg. */}
              <div className="grid w-full grid-cols-2 gap-2 lg:grid-cols-1">
                {TRUST_LEVELS.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-2.5 shadow-xs lg:px-3.5"
                  >
                    <span className={cn("text-[0.8125rem]", item.done ? "text-ink" : "text-muted")}>
                      {item.label}
                    </span>
                    {item.done ? (
                      <BadgeCheck className="size-4 shrink-0 text-trust" />
                    ) : (
                      <span className="size-4 shrink-0 rounded-full border-2 border-line-strong" />
                    )}
                  </div>
                ))}

                {/* Trust-by-design rule 2: show what is NOT verified, too. */}
                <p className="col-span-full pt-1 text-center text-[0.6875rem] text-subtle">
                  Jo verify nahi hua wo bhi dikhta hai — chhupaya nahi jaata
                </p>
              </div>
            </div>
          </div>
        </Card>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 6 · Journey                                                         */
/* ------------------------------------------------------------------ */

function Journey({ steps }: { steps: HomePageViewModel["howItWorks"] }) {
  return (
    <Section>
      <Container size="wide">
        <SectionHeading
          eyebrow="Journey"
          title="Register se safe connect tak."
          description="Har step pe AI batata hai ki abhi kya missing hai aur aage kya karna hai."
        />

        <RevealGroup className="relative mt-12 grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4 lg:gap-6">
          <div
            aria-hidden
            className="absolute inset-x-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent lg:block"
          />
          {steps.map((step) => (
            <RevealItem key={step.step} className="relative">
              <span className="relative grid size-10 place-items-center rounded-full border border-gold-300 bg-surface font-[family-name:var(--font-display)] text-base text-primary-text shadow-sm lg:size-12 lg:text-lg">
                {String(step.step).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-base leading-snug lg:mt-5 lg:text-lg">{step.title}</h3>
              <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted lg:mt-2 lg:text-[0.9375rem]">
                {step.description}
              </p>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 7 · Pricing (D-10 / D-11 / D-13)                                    */
/* ------------------------------------------------------------------ */

function Pricing({ plans }: { plans: HomePageViewModel["pricingPreview"] }) {
  return (
    <Section tone="subtle">
      <Container size="wide">
        <SectionHeading
          eyebrow="Pricing"
          title="Monthly. Kabhi bhi cancel."
          description="Koi hidden charge nahi. Har plan me clearly likha hai ki kya milega."
        />

        <SnapRail label="Subscription plans" className="mt-12">
          {plans.map((plan) => (
            <div key={plan.id} className="h-full">
              <Card
                variant={plan.isRecommended ? "elevated" : "default"}
                padding="lg"
                className={cn(
                  "relative flex h-full flex-col",
                  plan.isRecommended && "border-gold-500 ring-1 ring-gold-500/30",
                )}
              >
                {plan.isRecommended && (
                  <Pill tone="gold" size="sm" className="absolute -top-3 left-6">
                    Sabse popular
                  </Pill>
                )}

                <p className="text-lg font-semibold text-ink">{plan.name}</p>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-display)] text-4xl leading-none text-ink">
                    {plan.price.display}
                  </span>
                  <span className="text-[0.875rem] text-muted">/ mahina</span>
                </div>

                {/* D-13: both lines together, always. The "sirf ₹499" half on
                    its own is explicitly a dark pattern. */}
                {plan.partnerOffer && (
                  <div className="mt-3">
                    <Pill tone="trust" size="sm">
                      {plan.partnerOffer.firstMonth}
                    </Pill>
                    <p className="mt-1.5 text-[0.75rem] text-muted">{plan.partnerOffer.thereafter}</p>
                  </div>
                )}

                <ul className="mt-6 flex-1 space-y-2.5 border-t border-line pt-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[0.875rem] text-ink">
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-trust" />
                      {f}
                    </li>
                  ))}
                  {plan.limitations?.map((l) => (
                    <li key={l} className="flex items-start gap-2.5 text-[0.875rem] text-subtle">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-subtle" />
                      {l}
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  <CTALink
                    href="/pricing"
                    variant={plan.isRecommended ? "primary" : "secondary"}
                    className="w-full"
                  >
                    {plan.name} chunein
                  </CTALink>
                </div>
              </Card>
            </div>
          ))}
        </SnapRail>

        <p className="mt-6 text-center text-[0.8125rem] text-muted">
          Registration free hai · Card details store nahi hoti · Kabhi bhi cancel
        </p>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 8 · Partner (D-12 flat ₹100, D-80 lifetime)                         */
/* ------------------------------------------------------------------ */

function Partner({ partner }: { partner: HomePageViewModel["partnerPreview"] }) {
  return (
    <Section>
      <Container size="wide">
        <Card variant="elevated" padding="xl" className="relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -right-16 -top-16 size-64 rounded-full bg-gold-200/30 blur-3xl"
          />

          <div className="relative grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <Eyebrow>
                <Handshake />
                Partner network
              </Eyebrow>

              <h2 className="mt-4 text-3xl leading-tight sm:text-4xl">
                Ek baar refer kariye.
                <br />
                <span className="text-primary-text">Hamesha kamaiye.</span>
              </h2>

              <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted">
                {partner.description}
              </p>

              <div className="mt-7 space-y-3">
                {partner.benefits.map((b) => (
                  <div key={b.title} className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 size-[18px] shrink-0 text-trust" />
                    <div>
                      <p className="text-[0.9375rem] font-semibold text-ink">{b.title}</p>
                      <p className="text-[0.875rem] leading-snug text-muted">{b.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <CTALink href={partner.cta.href}>Partner program dekhein</CTALink>
              </div>
            </div>

            {/* Earnings illustration — D-80 lifetime recurring */}
            <div className="rounded-lg border border-line bg-bg-subtle p-6">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
                Ek referred user se
              </p>

              <p className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-none text-ink">
                <CountUp value={100} prefix="₹" />
                <span className="ml-1 text-base font-normal text-muted">har mahine</span>
              </p>

              <div className="mt-5 space-y-2 border-t border-line pt-5">
                {[
                  { m: "Mahina 1", a: "₹100" },
                  { m: "Mahina 2", a: "₹100" },
                  { m: "Mahina 3", a: "₹100" },
                ].map((r) => (
                  <div key={r.m} className="flex items-center justify-between text-[0.875rem]">
                    <span className="text-muted">{r.m}</span>
                    <span className="font-semibold tabular-nums text-ink">{r.a}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-[0.875rem] text-subtle">
                  <span>…jab tak wo renew karte rahein</span>
                  <span>∞</span>
                </div>
              </div>

              <p className="mt-5 text-[0.75rem] leading-snug text-muted">
                Flat ₹100 — plan koi bhi ho. Aur aapke refer kiye user ko pehla mahina sirf ₹499.
              </p>
            </div>
          </div>
        </Card>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 9 · Safety                                                          */
/* ------------------------------------------------------------------ */

const SAFETY_ICONS = [Fingerprint, Lock, Eye, Users];

function Safety({ safety }: { safety: HomePageViewModel["safetyPreview"] }) {
  return (
    <Section tone="deep">
      <Container size="wide">
        <div className="relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <Pill tone="onDeep">
              <ShieldCheck className="text-gold-300" />
              Safety
            </Pill>
            <h2 className="mt-5 text-3xl leading-tight text-white sm:text-4xl">
              {safety.headline}
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-white/65">{safety.description}</p>
          </div>

          <RevealGroup className="grid gap-4">
            {safety.points.map((point, i) => {
              const Icon = SAFETY_ICONS[i % SAFETY_ICONS.length];
              return (
                <RevealItem key={point}>
                  <div className="flex items-start gap-4 rounded-lg border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.09]">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-400/15 text-gold-300">
                      <Icon className="size-[18px]" />
                    </span>
                    <p className="text-[0.9375rem] leading-relaxed text-white/80">{point}</p>
                  </div>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </div>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 10 · Final CTA                                                      */
/* ------------------------------------------------------------------ */

function FinalCTA({ data }: { data: HomePageViewModel["finalCTA"] }) {
  return (
    <Section className="!pb-20 !pt-4 sm:!pb-24">
      <Container size="wide">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-gold-300 bg-gradient-to-br from-gold-50 via-surface to-trust-bg px-6 py-16 text-center dark:from-gold-900/30 dark:via-surface dark:to-trust-bg sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-gold-300/30 blur-3xl"
            />

            <div className="relative mx-auto max-w-2xl">
              <Pill tone="gold">
                <Sparkles />
                Shuru kijiye
              </Pill>

              <h2 className="mt-6 text-balance text-3xl leading-tight sm:text-[2.6rem]">
                {data.headline}
              </h2>

              <p className="mx-auto mt-4 max-w-lg text-pretty leading-relaxed text-muted sm:text-lg">
                {data.description}
              </p>

              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <CTALink href={data.primaryCTA.href}>{data.primaryCTA.label}</CTALink>
                <CTALink href={data.secondaryCTA.href} variant="secondary">
                  {data.secondaryCTA.label}
                </CTALink>
              </div>

              <p className="mt-6 text-[0.8125rem] text-subtle">
                Registration free hai · Card details store nahi hoti
              </p>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */

export default function HomePageView({ data }: Props) {
  return (
    <main>
      <Hero data={data.hero} />
      <CapabilityStrip />
      <RishtaReel />
      <ProfileMethods ai={data.aiProfileBuilder} biodata={data.biodataAutofill} />
      <TrustSection verified={data.verifiedProfile} />
      <Journey steps={data.howItWorks} />
      <Pricing plans={data.pricingPreview} />
      <Partner partner={data.partnerPreview} />
      <Safety safety={data.safetyPreview} />
      <FinalCTA data={data.finalCTA} />
    </main>
  );
}
