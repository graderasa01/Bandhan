import {
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
import { getT } from "@/lib/i18n/server";
import { Container, Eyebrow, Section, SectionHeading } from "@/components/ui/Container";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import CountUp from "@/components/ui/CountUp";
import ProgressRing from "@/components/ui/ProgressRing";
import Reveal, { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import SnapRail from "@/components/ui/SnapRail";
import { CTALink } from "@/components/ui/_shared/CTALink";
import HeroFillPreview from "@/components/public/home/HeroFillPreview";
import ReelPreview from "@/components/public/home/ReelPreview";
import GrioMapPreview from "@/components/public/home/GrioMapPreview";
import GrioAvatar from "@/components/grio/_shared/GrioAvatar";
import { cn } from "@/lib/utils";

type Props = { data: HomePageViewModel };

/* ------------------------------------------------------------------ */
/* 1 · Hero                                                            */
/* ------------------------------------------------------------------ */

const HERO_PROOF = [
  { icon: Mic, key: "home.heroProof.voice", label: "Bol kar profile" },
  { icon: BadgeCheck, key: "home.heroProof.verification", label: "7-level verification" },
  { icon: Lock, key: "home.heroProof.privacy", label: "Privacy-first" },
  { icon: Handshake, key: "home.heroProof.partners", label: "Approved partners only" },
];

async function Hero({ data }: { data: HomePageViewModel["hero"] }) {
  const t = await getT();
  return (
    <section className="pt-5 sm:pt-7">
      <Container size="wide">
        {/* bg-grad-hero reads the active theme pack (D-21b) instead of a
            hardcoded gradient — Raat/Kaagaz each carry their own mood.
            The shadow pair is the premium "gold edge" — a hairline ring
            plus a soft outer glow, both off --color-hero-ring-glow (itself
            a --bt-primary formula), so an admin's custom colour pick
            recolours the card's edge along with everything else. */}
        <div className="spotlight grain relative overflow-hidden rounded-2xl bg-grad-hero px-6 py-14 shadow-[inset_0_0_0_1px_var(--color-hero-ring-glow),0_30px_70px_-28px_var(--color-hero-ring-glow)] sm:px-10 sm:py-18 lg:px-14 lg:py-22">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent"
          />

          {/* min-w-0 on both cells: grid items default to min-width:auto, so
              anything that outgrows its column drags the whole hero wider
              rather than being contained by it. items-start, not -center:
              HeroFillPreview is much taller than the text column, and
              centering a short column inside a tall row left the text
              floating well below the card's own top edge. */}
          <div className="relative grid items-start gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
            <div className="min-w-0 max-w-xl lg:max-w-2xl">
              {/* Custom className, not tone="onDeep" — that tone hardcodes
                  white for a permanently-dark ground; the hero's own ground
                  flips light under Kaagaz (D-21b). */}
              <Pill
                tone="neutral"
                className="mb-6 border-hero-border bg-hero-chip-bg text-hero-fg backdrop-blur-sm"
              >
                <Sparkles className="text-hero-icon" />
                {t("home.hero.badge", "India ka AI-guided matrimony")}
              </Pill>

              <h1 className="text-balance text-[2.15rem] leading-[1.22] tracking-tight text-hero-fg sm:text-[2.75rem] sm:leading-[1.16] lg:text-[3.25rem] lg:leading-[1.12]">
                {t("home.hero.headlineStart", "Rishta wahi jisme")}{" "}
                <span className="text-foil">{t("home.hero.headlineAccent", "bharosa")}</span>{" "}
                {t("home.hero.headlineEnd", "pehle dikhe.")}
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
                {HERO_PROOF.map(({ icon: Icon, key, label }) => (
                  <li key={label} className="flex items-center gap-2.5 text-sm text-hero-fg-muted">
                    <Icon className="size-4 shrink-0 text-hero-icon" />
                    {t(key, label)}
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
/*
 * One number, one label. Each tile used to carry a second explanatory line,
 * which on a phone turned a glance into eight lines of small type — and a
 * strip whose whole job is to be glanced at cannot afford to be read. The
 * labels absorbed what the sub-lines were doing where it mattered ("AI ka
 * invent kiya data" says on its own what "Missing hai to missing hi rahega"
 * was there to explain).
 */
const CAPABILITIES = [
  { value: 8, suffix: "", labelKey: "home.capability.methods", label: "Profile banane ke tarike" },
  { value: 7, suffix: "", labelKey: "home.capability.levels", label: "Verification levels" },
  { value: 0, suffix: "", labelKey: "home.capability.invented", label: "AI ka invent kiya data" },
  { value: 100, suffix: "%", labelKey: "home.capability.approved", label: "Partners admin-approved" },
];

async function CapabilityStrip() {
  const t = await getT();
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
              <p className="mt-2.5 text-[0.8125rem] leading-snug text-muted sm:text-sm">
                {t(item.labelKey, item.label)}
              </p>
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

/**
 * Three claims, three chips.
 *
 * These were three rows of title-plus-description — about forty words sitting
 * between the headline and the only picture in the section. On a phone that
 * meant the whole first screen of the section was prose, and the swipe-card
 * stack that actually explains the product was somewhere below the fold. The
 * detail did not get deleted so much as moved: /how-it-works is the page whose
 * job is to carry it.
 */
const REEL_CHIPS = [
  { key: "home.reel.chipReady", label: "Subah tak ready" },
  { key: "home.reel.chipReason", label: "Wajah ke saath" },
  { key: "home.reel.chipFamily", label: "Family ko bhejein" },
];

async function RishtaReel() {
  const t = await getT();
  return (
    <Section tone="subtle">
      <Container size="wide">
        {/*
          * Three blocks, not two columns of stacked text.
          *
          * On a phone the order has to be headline → picture → chips: the card
          * is the proof, and making someone scroll past every word to reach it
          * is how the section read before. On lg the words go back to one
          * column (rows 1 and 2) with the card spanning both alongside, which
          * is the layout the card's height wants anyway.
          */}
        <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-center lg:gap-12">
          <Reveal className="lg:col-start-1 lg:row-start-1">
            <Eyebrow>
              <CalendarCheck />
              {t("home.reel.eyebrow", "Roz 5 rishtey")}
            </Eyebrow>

            {/* No <br />. A forced break that reads well at 1280px ragged the
                line badly at 390px, and the sentence is short enough now that
                the browser's own wrap is the right one at every width. */}
            <h2 className="mt-4 text-[2rem] leading-tight sm:text-4xl">
              {t("home.reel.headlineStart", "Kam rishtey.")}{" "}
              <span className="text-primary-text">
                {t("home.reel.headlineAccent", "Sahi rishtey.")}
              </span>
            </h2>

            <p className="mt-3 max-w-md text-pretty leading-relaxed text-muted">
              {t("home.reel.description", "Har rishte ke saath yeh bhi — ki wo kyu chuna gaya.")}
            </p>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <ReelPreview />
          </Reveal>

          <Reveal delay={0.15} className="lg:col-start-1 lg:row-start-2">
            <ul className="flex flex-wrap gap-2">
              {REEL_CHIPS.map((chip) => (
                <li
                  key={chip.key}
                  className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[0.875rem] font-medium text-ink shadow-xs"
                >
                  <BadgeCheck className="size-4 shrink-0 text-trust" />
                  {t(chip.key, chip.label)}
                </li>
              ))}
            </ul>

            {/*
              * Grio, in its own voice, once on the page.
              *
              * The section's claim is that somebody chose these five. A line
              * signed by the thing that did the choosing is a different kind
              * of sentence from one more bullet describing it — it is the
              * first place a visitor meets Grio as a character rather than as
              * a feature, which is what the map further down then pays off.
              */}
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-gold-300/60 bg-surface p-4 dark:border-gold-400/25">
              <GrioAvatar />
              <p className="text-[0.875rem] leading-relaxed text-ink">
                <span className="font-semibold">{t("home.reel.grioName", "Grio")}</span>{" "}
                <span className="text-muted">
                  {t(
                    "home.reel.grioNote",
                    "“Aaj ke paanch maine chune — wajah bhi bataunga.”",
                  )}
                </span>
              </p>
            </div>
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

async function ProfileMethods({
  ai,
  biodata,
}: {
  ai: HomePageViewModel["aiProfileBuilder"];
  biodata: HomePageViewModel["biodataAutofill"];
}) {
  const t = await getT();
  return (
    <Section>
      <Container size="wide">
        <SectionHeading
          eyebrow={t("home.methods.eyebrow", "Profile builder")}
          title={t("home.methods.title", "Form bharne ki zaroorat nahi.")}
          description={t("home.methods.description", "Bol dijiye ya biodata bhejiye. Baaki AI karega.")}
        />

        <SnapRail label={t("home.methods.railLabel", "Profile banane ke tarike")} className="mt-12">
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
                    {i === 0 && (
                      <Pill tone="gold" size="sm">
                        {t("home.methods.fastest", "Sabse tez")}
                      </Pill>
                    )}
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
                <strong className="font-semibold">
                  {t("home.methods.noInventTitle", "AI kabhi data invent nahi karta.")}
                </strong>{" "}
                {t("home.methods.noInventBody", "Clear na ho to poochega — bharega nahi.")}
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

async function TrustSection({ verified }: { verified: HomePageViewModel["verifiedProfile"] }) {
  const t = await getT();
  return (
    <Section tone="subtle">
      <Container size="wide">
        <Card variant="elevated" padding="xl">
          {/* items-start: the trust-score card is taller than the text
              column, same reasoning as the two sections above. */}
          <div className="grid gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-start lg:gap-10">
            <div>
              <Eyebrow>
                <ShieldCheck />
                Trust &amp; verification
              </Eyebrow>

              <h2 className="mt-4 text-[2rem] leading-tight sm:text-4xl">{verified.headline}</h2>
              <p className="mt-3 max-w-md text-pretty leading-relaxed text-muted">
                {verified.description}
              </p>

              <ul className="mt-6 space-y-3">
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
                  {t(
                    "home.trust.unverifiedNote",
                    "Jo verify nahi hua wo bhi dikhta hai — chhupaya nahi jaata",
                  )}
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
/* 6 · Grio Map — what the app actually is                             */
/* ------------------------------------------------------------------ */

/**
 * This replaced the "Journey" section: four numbered steps, each with a title
 * and a sentence, that between them said "register, fill it in, get matches".
 *
 * Three problems with that. It was the most text on the page for the least
 * information. /how-it-works is a whole page that already answers it, linked
 * from the nav and from the hero. And it described a *funnel* — the four
 * screens between a stranger and their first match — which is a fair account
 * of what to do next and a poor account of what the product is.
 *
 * The map answers the harder question. Six branches, twenty-three real
 * features, the product's own words for each — someone can see the whole thing
 * before deciding whether to sign into it, which is a stronger argument than
 * any list of steps and, unlike the list, is not something a competitor can
 * copy in an afternoon.
 */
async function GrioMap() {
  const t = await getT();
  return (
    <Section>
      <Container size="wide">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-14">
          <Reveal>
            <Eyebrow>
              <Sparkles />
              {t("home.map.eyebrow", "Grio")}
            </Eyebrow>

            <h2 className="mt-4 text-[2rem] leading-tight sm:text-4xl">
              {t("home.map.headlineStart", "Poora app,")}{" "}
              <span className="text-primary-text">{t("home.map.headlineAccent", "ek naksha.")}</span>
            </h2>

            <p className="mt-3 max-w-md text-pretty leading-relaxed text-muted">
              {t(
                "home.map.description",
                "Grio aapko raasta samjhata hai — kahan kya hai, aur agla step kya. Chhoo kar dekhiye.",
              )}
            </p>

            {/* Said here, in the words the product uses about itself. Grio
                explains the order; it does not choose the rishta. Getting that
                boundary wrong is the single most misleading thing this page
                could imply, so it is on the page rather than in a footnote. */}
            <p className="mt-5 max-w-md rounded-lg border border-line bg-bg-subtle p-4 text-[0.8125rem] leading-relaxed text-muted">
              {t(
                "home.map.boundary",
                "Grio raasta samjhata hai. Rishton ka order matching engine tay karta hai — faisla hamesha aapka aur aapke ghar ka.",
              )}
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <GrioMapPreview />
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 7 · Pricing (D-10 / D-11 / D-13)                                    */
/* ------------------------------------------------------------------ */

async function Pricing({ plans }: { plans: HomePageViewModel["pricingPreview"] }) {
  const t = await getT();
  return (
    <Section tone="subtle">
      <Container size="wide">
        <SectionHeading
          eyebrow={t("home.pricing.eyebrow", "Pricing")}
          title={t("home.pricing.title", "Monthly. Kabhi bhi cancel.")}
          description={t(
            "home.pricing.description",
            "Koi hidden charge nahi. Har plan me clearly likha hai ki kya milega.",
          )}
        />

        <SnapRail label={t("home.pricing.railLabel", "Subscription plans")} className="mt-12">
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
                    {t("home.pricing.mostPopular", "Sabse popular")}
                  </Pill>
                )}

                <p className="text-lg font-semibold text-ink">{plan.name}</p>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-display)] text-4xl leading-none text-ink">
                    {plan.price.display}
                  </span>
                  <span className="text-[0.875rem] text-muted">
                    {t("home.pricing.perMonth", "/ mahina")}
                  </span>
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
                    {t("home.pricing.chooseLead", "")}
                    {plan.name}
                    {t("home.pricing.chooseTrail", " chunein")}
                  </CTALink>
                </div>
              </Card>
            </div>
          ))}
        </SnapRail>

        <p className="mt-6 text-center text-[0.8125rem] text-muted">
          {t("home.pricing.footnote", "Card details store nahi hoti · Kabhi bhi cancel")}
        </p>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 8 · Partner (D-12 percentage commission, D-80 lifetime)             */
/* ------------------------------------------------------------------ */

async function Partner({ partner }: { partner: HomePageViewModel["partnerPreview"] }) {
  const t = await getT();
  // Held in a const so the null check narrows inside the row callbacks too.
  const { earnings } = partner;
  return (
    <Section>
      <Container size="wide">
        <Card variant="elevated" padding="xl" className="relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -right-16 -top-16 size-64 rounded-full bg-gold-200/30 blur-3xl"
          />

          <div
            className={cn(
              "relative grid gap-10 lg:items-center",
              earnings && "lg:grid-cols-[1fr_0.8fr]",
            )}
          >
            <div>
              <Eyebrow>
                <Handshake />
                Partner network
              </Eyebrow>

              <h2 className="mt-4 text-3xl leading-tight sm:text-4xl">
                {t("home.partner.headlineLine1", "Ek baar refer kariye.")}
                <br />
                <span className="text-primary-text">
                  {t("home.partner.headlineLine2", "Hamesha kamaiye.")}
                </span>
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
                <CTALink href={partner.cta.href}>
                  {t("home.partner.cta", "Partner program dekhein")}
                </CTALink>
              </div>
            </div>

            {/*
              * Earnings illustration — D-12 percentage, D-80 lifetime recurring.
              * Every figure comes from `earnings`, which lib/data/planData.ts
              * computes from the live plan prices and the live commission rate. The
              * card used to hardcode a flat ₹100 per month; commission has been a
              * percentage of the plan price since D-12 was revised, so that number
              * was advertising a payout the ledger never produces.
              */}
            {earnings && (
              <div className="rounded-lg border border-line bg-bg-subtle p-6">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
                  {t("home.partner.perUserLabel", "Ek referred user se")}
                </p>

                <p className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-none text-ink">
                  <CountUp
                    value={earnings.headlineRupees}
                    decimals={earnings.headlineDecimals}
                    prefix="₹"
                    indianFormat
                  />
                  <span className="ml-1 text-base font-normal text-muted">
                    {t("home.partner.everyMonth", "har mahine")}
                  </span>
                </p>

                {/* The headline is one plan's number, so the card says which one. */}
                <p className="mt-2 text-[0.8125rem] text-muted">{earnings.basisLine}</p>

                <div className="mt-5 space-y-2 border-t border-line pt-5">
                  {[
                    t("home.partner.month1", "Mahina 1"),
                    t("home.partner.month2", "Mahina 2"),
                    t("home.partner.month3", "Mahina 3"),
                  ].map((month) => (
                    <div key={month} className="flex items-center justify-between text-[0.875rem]">
                      <span className="text-muted">{month}</span>
                      <span className="font-semibold tabular-nums text-ink">
                        {earnings.headlineDisplay}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-[0.875rem] text-subtle">
                    <span>{t("home.partner.untilRenew", "…jab tak wo renew karte rahein")}</span>
                    <span>∞</span>
                  </div>
                </div>

                {/* The rate is uniform, the rupees are not — so the other plans are
                    listed rather than averaged away into one figure. */}
                <div className="mt-5 border-t border-line pt-5">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
                    {t("home.partner.perPlanLabel", "Plan ke hisaab se")}
                  </p>
                  <div className="mt-3 space-y-2">
                    {earnings.perPlan.map((p) => (
                      <div key={p.name} className="flex items-center justify-between text-[0.875rem]">
                        <span className="text-muted">
                          {p.name} · {p.priceDisplay}
                        </span>
                        <span className="font-semibold tabular-nums text-ink">
                          {p.commissionDisplay}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-5 text-[0.75rem] leading-snug text-muted">{earnings.note}</p>
              </div>
            )}
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
            <h2 className="mt-5 text-[2rem] leading-tight text-white sm:text-4xl">
              {safety.headline}
            </h2>
            <p className="mt-3 max-w-md text-pretty leading-relaxed text-white/65">
              {safety.description}
            </p>
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

async function FinalCTA({ data }: { data: HomePageViewModel["finalCTA"] }) {
  const t = await getT();
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
                {t("home.finalCta.badge", "Shuru kijiye")}
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
                {t("home.finalCta.footnote", "Registration free hai · Card details store nahi hoti")}
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
      <GrioMap />
      <Pricing plans={data.pricingPreview} />
      <Partner partner={data.partnerPreview} />
      <Safety safety={data.safetyPreview} />
      <FinalCTA data={data.finalCTA} />
    </main>
  );
}
