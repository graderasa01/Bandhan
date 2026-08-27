import {
  BadgeCheck,
  CalendarCheck,
  Eye,
  FileHeart,
  FileUp,
  Fingerprint,
  Handshake,
  Lock,
  Mic,
  Moon,
  PencilLine,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { HomePageViewModel } from "@/lib/contracts/publicPages";
import { getT } from "@/lib/i18n/server";
import { Container } from "@/components/ui/Container";
import CountUp from "@/components/ui/CountUp";
import ProgressRing from "@/components/ui/ProgressRing";
import Reveal, { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import SnapRail from "@/components/ui/SnapRail";
import { CTALink } from "@/components/ui/_shared/CTALink";
import HeroFillPreview from "@/components/public/home/HeroFillPreview";
import ReelPreview from "@/components/public/home/ReelPreview";
import {
  FamilySilhouette,
  LeafSpray,
  RuleMotif,
} from "@/components/public/_shared/Ornaments";
import { cn } from "@/lib/utils";

type Props = { data: HomePageViewModel };

/*
 * The marketing page as an invitation card, not a dashboard.
 *
 * Every section is a `.pc-shell` panel on the warm paper ground, with the
 * page gutter showing between them — there are no full-bleed colour bands
 * here any more, so vertical rhythm comes from the gap between panels and
 * the padding inside them rather than a Section wrapper's py-24. The colour,
 * the serif voice, the botanical line-work and every ornament class live in
 * `THE PUBLIC CANVAS` in app/globals.css; this file writes no colours of its
 * own beyond the handful of semantic utilities (text-muted, text-trust) whose
 * tokens that island already re-grounded.
 */

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
    <section className="pc-shell pc-shell--cream pc-shell--foil px-6 py-12 sm:px-10 sm:py-16 lg:px-14 lg:py-20">
      {/* The sprays hang off the panel's corners and are clipped by its own
          overflow — a botanical that ends inside the frame reads as clip-art,
          one that runs off the edge reads as printing. */}
      <LeafSpray className="pc-vine -left-12 -top-14 h-[240px] w-[144px] sm:-left-14 sm:-top-16 sm:h-[340px] sm:w-[204px]" />
      <LeafSpray
        flip
        className="pc-vine pc-vine--soft -bottom-16 -right-10 hidden h-[320px] w-[192px] lg:block"
      />

      <div className="relative grid items-start gap-12 lg:grid-cols-[1.06fr_0.94fr] lg:gap-12">
        <div className="min-w-0 max-w-xl">
          <span className="pc-eyebrow">
            <ShieldCheck className="size-4" />
            {t("home.hero.badge", "India ka AI-guided matrimony")}
          </span>

          <h1 className="pc-display mt-6 text-[2.25rem] sm:text-[2.9rem] lg:text-[3.45rem]">
            {t("home.hero.headlineStart", "Rishta wahi jisme")}{" "}
            <span className="pc-gold">{t("home.hero.headlineAccent", "bharosa")}</span>{" "}
            {t("home.hero.headlineEnd", "pehle dikhe.")}
          </h1>

          <div className="pc-rule mt-6 max-w-[320px]">
            <RuleMotif />
          </div>

          <p className="mt-6 max-w-md text-pretty leading-relaxed text-muted sm:text-[1.0625rem]">
            {data.subheadline}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <CTALink href={data.primaryCTA.href} className="pc-cta">
              {data.primaryCTA.label}
            </CTALink>
            <CTALink href={data.secondaryCTA.href} className="pc-cta-ghost">
              {data.secondaryCTA.label}
            </CTALink>
          </div>

          <ul className="mt-10 grid gap-x-6 gap-y-4 sm:max-w-lg sm:grid-cols-2">
            {HERO_PROOF.map(({ icon: Icon, key, label }) => (
              <li key={label} className="flex items-center gap-3 text-[0.9375rem] text-ink">
                <span className="pc-ring [--pc-ring-size:2.25rem]">
                  <Icon className="size-[17px]" />
                </span>
                {t(key, label)}
              </li>
            ))}
          </ul>
        </div>

        {/* The biodata-extraction demo is a desktop showcase piece — on
            phones it just added scroll length without adding proof the
            proof-point list above doesn't already carry. */}
        <div className="hidden min-w-0 lg:block lg:pl-2">
          <HeroFillPreview />
        </div>
      </div>
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
  {
    icon: Users,
    value: 8,
    suffix: "",
    labelKey: "home.capability.methods",
    label: "Profile banane ke tarike",
    subKey: "home.capability.methodsSub",
    sub: "Bol kar · biodata · chat · manual",
  },
  {
    icon: ShieldCheck,
    value: 7,
    suffix: "",
    labelKey: "home.capability.levels",
    label: "Verification levels",
    subKey: "home.capability.levelsSub",
    sub: "Mobile se video verify tak",
  },
  {
    icon: Lock,
    value: 0,
    suffix: "",
    labelKey: "home.capability.invented",
    label: "Data AI khud banata hai",
    subKey: "home.capability.inventedSub",
    sub: "Missing hai to missing hi rahega",
  },
  {
    icon: BadgeCheck,
    value: 100,
    suffix: "%",
    labelKey: "home.capability.approved",
    label: "Partners admin-approved",
    subKey: "home.capability.approvedSub",
    sub: "Self-approval possible hi nahi",
  },
];

async function CapabilityStrip() {
  const t = await getT();
  return (
    <section className="pc-shell px-1.5 py-1.5 sm:px-2 sm:py-2">
      {/* Two-up on phones: four full-width rows of one number each is a lot of
          scroll for what is essentially a glance. `.pc-quad` draws the inset
          hairlines between cells. */}
      <RevealGroup className="pc-quad grid grid-cols-2 lg:grid-cols-4">
        {CAPABILITIES.map(({ icon: Icon, ...item }) => (
          <RevealItem
            key={item.label}
            className="flex items-start gap-3 px-3.5 py-5 sm:gap-4 sm:px-6 sm:py-7"
          >
            <span className="pc-ring [--pc-ring-size:2.5rem] sm:[--pc-ring-size:2.75rem]">
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="pc-numeral text-[1.75rem] sm:text-[2.15rem]">
                <CountUp value={item.value} suffix={item.suffix} />
              </p>
              <p className="mt-1.5 text-[0.8125rem] font-semibold leading-snug text-ink sm:text-sm">
                {t(item.labelKey, item.label)}
              </p>
              <p className="mt-1 text-[0.75rem] leading-snug text-muted">
                {t(item.subKey, item.sub)}
              </p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Rishta Reel — the core loop (D-02)                              */
/* ------------------------------------------------------------------ */

async function RishtaReel() {
  const t = await getT();
  const points = [
    {
      icon: Moon,
      tone: "",
      title: t("home.reel.pointNightTitle", "AI raat bhar kaam karta hai"),
      desc: t("home.reel.pointNightDesc", "Subah aapke liye chuni hui profiles ready hoti hain"),
    },
    {
      icon: Search,
      tone: "",
      title: t("home.reel.pointReasonTitle", "Har match ka reason"),
      desc: t("home.reel.pointReasonDesc", "Kya match karta hai — aur kya check karna chahiye"),
    },
    {
      icon: Users,
      tone: "pc-ring--trust",
      title: t("home.reel.pointFamilyTitle", "Family ko bhej sakte hain"),
      desc: t("home.reel.pointFamilyDesc", "Ek swipe me profile parivaar ke paas"),
    },
  ];

  return (
    <section className="pc-shell pc-shell--blush px-6 py-12 sm:px-10 sm:py-16 lg:px-14 lg:py-18">
      <LeafSpray flip className="pc-vine -right-14 -top-12 h-[360px] w-[216px]" />

      {/* items-start: ReelPreview's swipe-card stack is much taller than
          the text column, and centering left the text sitting well below
          the card's own top edge. */}
      <div className="relative grid gap-12 lg:grid-cols-[1fr_0.84fr] lg:items-start lg:gap-14">
        <Reveal>
          <span className="pc-eyebrow pc-eyebrow--caps">
            <CalendarCheck className="size-3.5" />
            Rishta Real
          </span>

          <h2 className="pc-display mt-5 text-[1.9rem] sm:text-[2.5rem]">
            {t("home.reel.headlineStart", "Roz")}{" "}
            <span className="pc-gold">{t("home.reel.headlineAccent", "paanch")}</span>{" "}
            {t("home.reel.headlineEnd", "rishtey.")}
            <br />
            {t("home.reel.headlineLine2", "Hazaaron nahi.")}
          </h2>

          <p className="mt-5 max-w-lg text-pretty leading-relaxed text-muted sm:text-[1.0625rem]">
            {t(
              "home.reel.description",
              "Endless scrolling se thak jaate hain log. BandhanTak roz sirf kuch profiles dikhata hai — par har ek ke saath ye batata hai ki wo kyu chuni gayi.",
            )}
          </p>

          <div className="mt-8 space-y-5">
            {points.map(({ icon: Icon, tone, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <span className={cn("pc-ring mt-0.5 [--pc-ring-size:2.75rem]", tone)}>
                  <Icon className="size-[18px]" />
                </span>
                <div>
                  <p className="text-[0.9375rem] font-semibold text-ink">{title}</p>
                  <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <ReelPreview />
        </Reveal>
      </div>
    </section>
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
    <section className="pc-shell pc-shell--cream px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
      <div className="relative grid items-center gap-8 lg:grid-cols-[auto_1fr_auto] lg:gap-10">
        <span className="pc-ring pc-ring--blush mx-auto [--pc-ring-size:4.25rem] lg:mx-0">
          <FileHeart className="size-7" />
        </span>

        <div className="text-center">
          <h2 className="pc-display text-[1.85rem] sm:text-[2.35rem]">
            {t("home.methods.title", "Form bharne ki zaroorat nahi.")}
          </h2>
          <div className="pc-rule mx-auto mt-4 max-w-[260px]">
            <RuleMotif />
          </div>
          <p className="mx-auto mt-4 max-w-lg text-pretty leading-relaxed text-muted">
            {t(
              "home.methods.description",
              "Bol dijiye, ya biodata upload kar dijiye. AI baaki kaam karta hai — aap sirf check karke confirm kariye.",
            )}
          </p>
        </div>

        {/* Drawn, not photographed — a stock couple on a matrimony page is the
            one image every visitor has already learned to distrust. */}
        <FamilySilhouette className="mx-auto h-24 w-auto text-primary sm:h-28 lg:h-32" />
      </div>

      <SnapRail label={t("home.methods.railLabel", "Profile banane ke tarike")} className="mt-11">
        {ai.methods.map((method, i) => {
          const Icon = METHOD_ICONS[i] ?? Sparkles;
          return (
            <div key={method.title} className="h-full">
              <div className="pc-card group h-full p-6 transition-all duration-300 hover:-translate-y-1 hover:border-gold-400">
                <span className="pc-ring [--pc-ring-size:3rem]">
                  <Icon className="size-5" />
                </span>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <h3 className="pc-display text-[1.2rem] leading-snug">{method.title}</h3>
                  {i === 0 && (
                    <span className="pc-eyebrow pc-eyebrow--caps">
                      {t("home.methods.fastest", "Sabse tez")}
                    </span>
                  )}
                </div>

                <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
                  {method.description}
                </p>
              </div>
            </div>
          );
        })}
      </SnapRail>

      <Reveal delay={0.15}>
        <div className="mt-8 flex flex-col items-start gap-5 rounded-2xl border border-gold-300 bg-gold-50/70 p-6 sm:flex-row sm:items-center sm:justify-between dark:border-gold-400/25 dark:bg-gold-900/25">
          <p className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-gold-800 dark:text-gold-100">
            <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <span>
              <strong className="font-semibold">
                {t("home.methods.noInventTitle", "AI kabhi data invent nahi karta.")}
              </strong>{" "}
              {t(
                "home.methods.noInventBody",
                "Koi detail clear na ho to wo aapse poochega — apne aap bhar nahi dega.",
              )}
            </span>
          </p>
          <CTALink href={biodata.cta.href} className="pc-cta shrink-0">
            {biodata.cta.label}
          </CTALink>
        </div>
      </Reveal>
    </section>
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
    <section className="pc-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
      {/* items-start: the trust-score card is taller than the text column. */}
      <div className="grid gap-12 lg:grid-cols-[1fr_0.78fr] lg:items-start lg:gap-14">
        <div>
          <span className="pc-eyebrow pc-eyebrow--caps">
            <ShieldCheck className="size-3.5" />
            Trust &amp; verification
          </span>

          <h2 className="pc-display mt-5 text-[1.85rem] sm:text-[2.35rem]">{verified.headline}</h2>
          <div className="pc-rule mt-4 max-w-[300px]">
            <RuleMotif />
          </div>
          <p className="mt-4 text-pretty leading-relaxed text-muted">{verified.description}</p>

          <ul className="mt-7 space-y-4">
            {verified.points.map((point) => (
              <li key={point} className="flex items-start gap-3.5">
                <span className="pc-ring pc-ring--trust mt-0.5 [--pc-ring-size:2rem]">
                  <BadgeCheck className="size-4" />
                </span>
                <span className="text-[0.9375rem] leading-relaxed text-ink">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pc-card flex flex-col items-center gap-5 p-5 sm:gap-7 sm:p-7">
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
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 lg:px-3.5"
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
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 6 · Journey                                                         */
/* ------------------------------------------------------------------ */

async function Journey({ steps }: { steps: HomePageViewModel["howItWorks"] }) {
  const t = await getT();
  return (
    <section className="pc-shell pc-shell--cream px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
      <LeafSpray className="pc-vine pc-vine--soft -bottom-20 -left-14 hidden h-[300px] w-[180px] lg:block" />

      <div className="relative mx-auto max-w-2xl text-center">
        <span className="pc-eyebrow pc-eyebrow--caps mx-auto">
          {t("home.journey.eyebrow", "Journey")}
        </span>
        <h2 className="pc-display mt-5 text-[1.85rem] sm:text-[2.35rem]">
          {t("home.journey.title", "Register se safe connect tak.")}
        </h2>
        <div className="pc-rule mx-auto mt-4 max-w-[260px]">
          <RuleMotif />
        </div>
        <p className="mt-4 text-pretty leading-relaxed text-muted">
          {t(
            "home.journey.description",
            "Har step pe AI batata hai ki abhi kya missing hai aur aage kya karna hai.",
          )}
        </p>
      </div>

      <RevealGroup className="relative mt-12 grid grid-cols-2 gap-x-5 gap-y-9 lg:grid-cols-4 lg:gap-6">
        <div aria-hidden className="pc-thread absolute inset-x-6 top-[22px] hidden lg:block" />
        {steps.map((step) => (
          <RevealItem key={step.step} className="relative">
            <span className="pc-step">{String(step.step).padStart(2, "0")}</span>
            <h3 className="pc-display mt-4 text-[1.05rem] leading-snug lg:mt-5 lg:text-[1.15rem]">
              {step.title}
            </h3>
            <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted lg:mt-2">
              {step.description}
            </p>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 7 · Partner (D-12 percentage commission, D-80 lifetime)             */
/* ------------------------------------------------------------------ */

async function Partner({ partner }: { partner: HomePageViewModel["partnerPreview"] }) {
  const t = await getT();
  // Held in a const so the null check narrows inside the row callbacks too.
  const { earnings } = partner;
  return (
    <section className="pc-shell px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
      <div
        className={cn(
          "relative grid gap-10 lg:items-center lg:gap-14",
          earnings && "lg:grid-cols-[1fr_0.78fr]",
        )}
      >
        <div>
          <span className="pc-eyebrow pc-eyebrow--caps">
            <Handshake className="size-3.5" />
            Partner network
          </span>

          <h2 className="pc-display mt-5 text-[1.85rem] sm:text-[2.35rem]">
            {t("home.partner.headlineLine1", "Ek baar refer kariye.")}
            <br />
            <span className="pc-gold">
              {t("home.partner.headlineLine2", "Hamesha kamaiye.")}
            </span>
          </h2>

          <div className="pc-rule mt-4 max-w-[300px]">
            <RuleMotif />
          </div>

          <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted">
            {partner.description}
          </p>

          <div className="mt-7 space-y-4">
            {partner.benefits.map((b) => (
              <div key={b.title} className="flex items-start gap-3.5">
                <span className="pc-ring pc-ring--trust mt-0.5 [--pc-ring-size:2rem]">
                  <BadgeCheck className="size-4" />
                </span>
                <div>
                  <p className="text-[0.9375rem] font-semibold text-ink">{b.title}</p>
                  <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">{b.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <CTALink href={partner.cta.href} className="pc-cta">
              {t("home.partner.cta", "Partner program dekhein")}
            </CTALink>
          </div>
        </div>

        {/*
          * Earnings illustration — D-12 percentage, D-80 lifetime recurring.
          * Every figure comes from `earnings`, which lib/data/planData.ts
          * computes from the live plan prices and the live commission rate.
          */}
        {earnings && (
          <div className="pc-card p-6">
            <p className="pc-microlabel">
              {t("home.partner.perUserLabel", "Ek referred user se")}
            </p>

            <p className="pc-numeral mt-2 text-[2.4rem]">
              <CountUp
                value={earnings.headlineRupees}
                decimals={earnings.headlineDecimals}
                prefix="₹"
                indianFormat
              />
              <span className="ml-1.5 font-[family-name:var(--font-sans)] text-base font-normal text-muted">
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
              <p className="pc-microlabel">
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
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 8 · Safety                                                          */
/* ------------------------------------------------------------------ */

const SAFETY_ICONS = [Fingerprint, Lock, Eye, Users];

function Safety({ safety }: { safety: HomePageViewModel["safetyPreview"] }) {
  return (
    <section className="pc-shell pc-shell--deep px-6 py-12 sm:px-10 sm:py-16 lg:px-14">
      <LeafSpray className="pc-vine -right-12 -top-14 h-[320px] w-[192px]" flip />

      <div className="relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <span className="pc-eyebrow pc-eyebrow--caps">
            <ShieldCheck className="size-3.5" />
            Safety
          </span>
          <h2 className="pc-display mt-5 text-[1.85rem] sm:text-[2.35rem]">{safety.headline}</h2>
          <div className="pc-rule mt-4 max-w-[300px]">
            <RuleMotif />
          </div>
          <p className="mt-4 text-pretty leading-relaxed text-muted">{safety.description}</p>
        </div>

        <RevealGroup className="grid gap-3.5">
          {safety.points.map((point, i) => {
            const Icon = SAFETY_ICONS[i % SAFETY_ICONS.length];
            return (
              <RevealItem key={point}>
                <div className="pc-card flex items-start gap-4 p-5 transition-colors hover:bg-surface-2">
                  <span className="pc-ring [--pc-ring-size:2.5rem]">
                    <Icon className="size-[18px]" />
                  </span>
                  <p className="text-[0.9375rem] leading-relaxed text-muted">{point}</p>
                </div>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 9 · Final CTA                                                       */
/* ------------------------------------------------------------------ */

async function FinalCTA({ data }: { data: HomePageViewModel["finalCTA"] }) {
  const t = await getT();
  return (
    <section className="pc-shell pc-shell--cream pc-shell--foil px-6 py-14 text-center sm:px-12 sm:py-18">
      <LeafSpray className="pc-vine pc-vine--soft -bottom-16 -left-14 h-[300px] w-[180px]" />
      <LeafSpray
        flip
        className="pc-vine pc-vine--soft -bottom-16 -right-14 h-[300px] w-[180px]"
      />

      <Reveal className="relative mx-auto max-w-2xl">
        <span className="pc-eyebrow pc-eyebrow--caps mx-auto">
          <Sparkles className="size-3.5" />
          {t("home.finalCta.badge", "Shuru kijiye")}
        </span>

        <h2 className="pc-display mt-6 text-[1.95rem] sm:text-[2.6rem]">{data.headline}</h2>

        <div className="pc-rule mx-auto mt-5 max-w-[260px]">
          <RuleMotif />
        </div>

        <p className="mx-auto mt-5 max-w-lg text-pretty leading-relaxed text-muted sm:text-[1.0625rem]">
          {data.description}
        </p>

        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <CTALink href={data.primaryCTA.href} className="pc-cta">
            {data.primaryCTA.label}
          </CTALink>
          <CTALink href={data.secondaryCTA.href} className="pc-cta-ghost">
            {data.secondaryCTA.label}
          </CTALink>
        </div>

        <p className="mt-6 text-[0.8125rem] text-subtle">
          {t("home.finalCta.footnote", "Registration free hai · Card details store nahi hoti")}
        </p>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export default function HomePageView({ data }: Props) {
  return (
    <main>
      <Container size="wide" className="flex flex-col gap-5 pb-16 pt-4 sm:gap-7 sm:pb-20 sm:pt-6">
        <Hero data={data.hero} />
        <CapabilityStrip />
        <RishtaReel />
        <ProfileMethods ai={data.aiProfileBuilder} biodata={data.biodataAutofill} />
        <TrustSection verified={data.verifiedProfile} />
        <Journey steps={data.howItWorks} />
        <Partner partner={data.partnerPreview} />
        <Safety safety={data.safetyPreview} />
        <FinalCTA data={data.finalCTA} />
      </Container>
    </main>
  );
}
