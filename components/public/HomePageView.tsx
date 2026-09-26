import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
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
import type { ReactNode } from "react";
import type { HomePageViewModel } from "@/lib/contracts/publicPages";
import { getT } from "@/lib/i18n/server";
import { Container } from "@/components/ui/Container";
import CountUp from "@/components/ui/CountUp";
import ProgressRing from "@/components/ui/ProgressRing";
import Reveal, { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import SnapRail from "@/components/ui/SnapRail";
import HeroFillPreview from "@/components/public/home/HeroFillPreview";
import HomeAppInstall from "@/components/pwa/HomeAppInstall";
import { ANDROID_APK_DOWNLOAD_PATH, androidApkUrl } from "@/lib/pwa/androidApk";
import { cn } from "@/lib/utils";

type Props = { data: HomePageViewModel };

/*
 * The marketing page as panes of glass standing in a room.
 *
 * The reference is `reference images/Codex Image Sep 18, 2026, 12_03_41 PM.png`
 * and this file speaks its vocabulary rather than inventing one: a section is
 * a `.glass-card`, a list of short facts is a rail of `.glass-chip` pills, an
 * icon is a `.glass-seal`, and the single decisive action on the page is
 * `.accent-primary`. All five come from `THE GLASS MATERIAL SYSTEM` in
 * app/globals.css, re-cut for this room by the `.satin-room` block underneath
 * it. Nothing here writes a colour, a rim, a blur or a shadow of its own —
 * that was the whole failure mode the material system was written to end.
 *
 * ## Why the data is in chips
 *
 * Every section of this page used to be a column of icon-and-two-lines rows.
 * On glass that reads as a page of loose icons: the pane has one lit edge and
 * everything inside it floats. The reference answers this by giving every
 * small thing its own edge — a pill, a bubble, a disc — so a card reads as a
 * card with OBJECTS in it. So wherever the underlying data is genuinely a list
 * of short facts (verification levels, safety topics, a reel's promises), it
 * is a chip rail; where it is a paragraph, it stays a paragraph.
 *
 * One chip per rail may carry `.glass-chip--accent`, the way one city is
 * already chosen in the reference. It is the wine in the picture, and it is
 * rationed to one per section.
 */

/* ------------------------------------------------------------------ */
/* Shared parts                                                        */
/* ------------------------------------------------------------------ */

/** A section. `tone="lit"` is the gold rim, rationed to the two panels that
 *  open and close the page. */
function Panel({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: "lit";
}) {
  return (
    <section
      className={cn(
        "glass-surface glass-card relative px-5 py-8 sm:px-9 sm:py-12 lg:px-12 lg:py-14",
        tone === "lit" && "glass-card--foil",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** A pill. `tone="accent"` is the chosen one — one per rail, never two. */
function Chip({
  icon: Icon,
  children,
  tone,
  className,
}: {
  icon?: typeof ShieldCheck;
  children: ReactNode;
  tone?: "accent";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "glass-surface glass-chip inline-flex items-center gap-2 px-3.5 py-2 text-[0.8125rem] leading-none sm:px-4 sm:py-2.5 sm:text-[0.875rem]",
        tone === "accent" && "glass-chip--accent",
        className,
      )}
    >
      {Icon && <Icon className="size-[15px] shrink-0 opacity-85" />}
      <span className="inline-flex items-center gap-2 whitespace-nowrap">{children}</span>
    </span>
  );
}

/** The round badge. In the reference every icon that matters stands in one. */
function Seal({
  icon: Icon,
  className,
  size = "md",
}: {
  icon: typeof ShieldCheck;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "glass-seal grid shrink-0 place-items-center text-gold",
        size === "sm" && "size-9",
        size === "md" && "size-11",
        size === "lg" && "size-16",
        className,
      )}
    >
      <Icon className={cn(size === "lg" ? "size-7" : size === "md" ? "size-[19px]" : "size-4")} />
    </span>
  );
}

/** The one filled action. */
function CtaPrimary({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return null;
  return (
    <Link
      href={href}
      className="accent-primary group inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[0.9375rem] font-semibold transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5"
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Its quiet twin: the same pill in glass instead of wine. */
function CtaGhost({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return null;
  return (
    <Link
      href={href}
      className="glass-surface glass-control group inline-flex h-12 items-center justify-center gap-2 px-7 text-[0.9375rem] font-semibold text-ink transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5"
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Eyebrow. A label, not a badge — see `.gold-label` for why it has no pill. */
function GoldLabel({ icon: Icon, children }: { icon?: typeof ShieldCheck; children: ReactNode }) {
  return (
    <span className="gold-label">
      {Icon && <Icon className="size-3.5" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 1 · Hero                                                            */
/* ------------------------------------------------------------------ */

/*
 * The four claims the hero makes. Each one's supporting line used to sit
 * under it here; it now lives in the section that actually proves it — voice
 * in Methods, the seven levels in Trust, privacy in Safety, approval in
 * Partner — so the hero can say four things in four pills instead of eight
 * lines, which is what the reference does with its cities.
 */
const HERO_PROOF = [
  { icon: Mic, key: "home.heroProof.voice", label: "Bol kar profile" },
  { icon: BadgeCheck, key: "home.heroProof.verification", label: "7-level verification" },
  { icon: Lock, key: "home.heroProof.privacy", label: "Privacy-first" },
  { icon: Handshake, key: "home.heroProof.partners", label: "Approved partners only" },
];

async function Hero({ data }: { data: HomePageViewModel["hero"] }) {
  const t = await getT();
  return (
    <Panel tone="lit" className="lg:py-16">
      <div className="grid items-start gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
        <div className="min-w-0">
          <GoldLabel icon={ShieldCheck}>
            {t("home.hero.badge", "India ka AI-guided matrimony")}
          </GoldLabel>

          <h1 className="bt-display mt-5 max-w-[13ch] text-[2.15rem] sm:max-w-none sm:text-[2.9rem] lg:text-[3.3rem]">
            {t("home.hero.headlineStart", "Rishta wahi jisme")}{" "}
            <span className="text-gold">{t("home.hero.headlineAccent", "bharosa")}</span>{" "}
            {t("home.hero.headlineEnd", "pehle dikhe.")}
          </h1>

          <p className="mt-4 max-w-md text-pretty text-[0.9375rem] leading-relaxed text-muted sm:text-[1.0625rem]">
            {data.subheadline}
          </p>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
            <CtaPrimary href={data.primaryCTA.href}>{data.primaryCTA.label}</CtaPrimary>
            <CtaGhost href={data.secondaryCTA.href}>{data.secondaryCTA.label}</CtaGhost>
          </div>

          <div className="chip-rail mt-7">
            {HERO_PROOF.map(({ icon, key, label }) => (
              <Chip key={label} icon={icon}>
                {t(key, label)}
              </Chip>
            ))}
          </div>

          {/* The line the whole product is an argument for. */}
          <p className="mt-8 text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-subtle">
            {t("home.hero.creed", "Rishtey zyada, behtar nahi")}{" "}
            <span className="text-gold">{t("home.hero.creedAccent", "balki sahi")}</span>
          </p>
        </div>

        {/* The biodata-extraction demo is a desktop showcase piece — on
            phones it only adds scroll without adding proof the chip rail
            above does not already carry. */}
        <div className="hidden min-w-0 lg:block">
          <HeroFillPreview />
        </div>
      </div>
    </Panel>
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
    <Panel className="px-3 py-3 sm:px-4 sm:py-4 lg:px-4 lg:py-4">
      <RevealGroup className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {CAPABILITIES.map(({ icon: Icon, ...item }) => (
          <RevealItem key={item.label}>
            {/* A cell is its own pane, not a cell in a grid with hairlines:
                on glass a hairline reads as a seam in the sheet. */}
            <div className="glass-surface glass-card--soft h-full px-3.5 py-4 [--surface-radius:18px] sm:px-5 sm:py-5">
              <Seal icon={Icon} size="sm" />
              <p className="bt-numeral mt-3 text-[1.7rem] sm:text-[2.05rem]">
                <CountUp value={item.value} suffix={item.suffix} />
              </p>
              <p className="mt-1.5 text-[0.8125rem] font-semibold leading-snug text-ink sm:text-sm">
                {t(item.labelKey, item.label)}
              </p>
              <p className="mt-1 text-[0.75rem] leading-snug text-muted">{t(item.subKey, item.sub)}</p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Rishta Reel — the core loop (D-02)                              */
/* ------------------------------------------------------------------ */

/**
 * The Rishta Reel, shown as the screen itself.
 *
 * This is `reference images/Codex Image Sep 16, 2026, 09_34_14 PM.png`, the
 * picture of the reel the page is describing, encoded to a 131KB webp at
 * `public/marketing/`. It is a MARKETING MOCK and nothing on it is a real
 * profile — the same rule the illustration it replaces carried in its header.
 *
 * Full width of its column, and a pane of the page's own glass around it: the
 * picture is clipped to the card radius and the lit rim is drawn on its
 * corners, so it reads as one more glass card rather than as a photo dropped
 * into the page. `overflow-hidden` is what clips it; the rim survives because
 * `.glass-surface::before` is positioned, and a positioned descendant paints
 * above the in-flow image.
 */
function ReelScreen() {
  return (
    <div className="glass-surface glass-card relative w-full overflow-hidden">
      <Image
        src="/marketing/rishta-reel-screen.webp"
        alt="Rishta Reel screen: ek profile card, uske reasons, aur neeche ke actions"
        width={780}
        height={1386}
        sizes="(max-width: 1024px) 100vw, 40vw"
        className="block h-auto w-full"
      />
    </div>
  );
}

async function RishtaReel() {
  const t = await getT();
  const points = [
    {
      icon: Moon,
      title: t("home.reel.pointNightTitle", "AI raat bhar kaam karta hai"),
      desc: t("home.reel.pointNightDesc", "Har nayi profile aapke hisaab se apni jagah par lagti hai"),
    },
    {
      icon: Search,
      title: t("home.reel.pointReasonTitle", "Har match ka reason"),
      desc: t("home.reel.pointReasonDesc", "Kya match karta hai — aur kya check karna chahiye"),
    },
    {
      icon: Users,
      title: t("home.reel.pointFamilyTitle", "Family ko bhej sakte hain"),
      desc: t("home.reel.pointFamilyDesc", "Ek swipe me profile parivaar ke paas"),
    },
  ];

  return (
    <Panel>
      {/* items-start: the swipe-card stack is much taller than the text. */}
      <div className="grid gap-10 lg:grid-cols-[1fr_0.84fr] lg:items-start lg:gap-14">
        <Reveal>
          <GoldLabel icon={CalendarCheck}>Rishta Reel</GoldLabel>

          {/* D-91: the promise stopped being "only fifteen" and became "all of
              them, in the right order". Hiding real rishtey behind a daily
              number was never the thing that made this feel serious — the
              reason under every card was. */}
          <h2 className="bt-display mt-5 text-[1.9rem] sm:text-[2.45rem]">
            {t("home.reel.headlineStart", "Jitne")}{" "}
            <span className="text-gold">{t("home.reel.headlineAccent", "rishtey")}</span>{" "}
            {t("home.reel.headlineEnd", "aapke liye hain.")}
            <br />
            {t("home.reel.headlineLine2", "Sab, wajah ke saath.")}
          </h2>

          <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted sm:text-[1.0625rem]">
            {t(
              "home.reel.description",
              "Koi roz ki limit nahi — jo bhi aapse match karta hai, sab dikhta hai. Par hisaab se: sabse behtar pehle, aur har profile ke saath ye batate hue ki wo kyu chuni gayi.",
            )}
          </p>

          {/* Each promise is a pane with its own edge, and the first one takes
              the wine: it is the claim the section is actually about. */}
          <div className="mt-7 grid gap-2.5">
            {points.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
                className={cn(
                  "glass-surface glass-card--soft flex items-start gap-3.5 px-4 py-3.5 [--surface-radius:18px]",
                  i === 0 && "[--surface-alpha:0.62]",
                )}
              >
                <Seal icon={Icon} size="sm" />
                <div className="min-w-0">
                  <p className="text-[0.9375rem] font-semibold leading-snug text-ink">{title}</p>
                  <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1} className="min-w-0">
          <ReelScreen />
        </Reveal>
      </div>
    </Panel>
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
    <Panel>
      <div className="flex flex-col items-center gap-5 text-center">
        <Seal icon={FileHeart} size="lg" />
        <h2 className="bt-display text-[1.85rem] sm:text-[2.35rem]">
          {t("home.methods.title", "Form bharne ki zaroorat nahi.")}
        </h2>
        <p className="max-w-lg text-pretty leading-relaxed text-muted">
          {t(
            "home.methods.description",
            "Bol dijiye, ya biodata upload kar dijiye. AI baaki kaam karta hai — aap sirf check karke confirm kariye.",
          )}
        </p>
      </div>

      <SnapRail label={t("home.methods.railLabel", "Profile banane ke tarike")} className="mt-9">
        {ai.methods.map((method, i) => {
          const Icon = METHOD_ICONS[i] ?? Sparkles;
          return (
            <div key={method.title} className="h-full">
              <div className="glass-surface glass-card--soft h-full p-5 [--surface-radius:20px]">
                <Seal icon={Icon} />
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <h3 className="bt-display text-[1.2rem] leading-snug">{method.title}</h3>
                  {i === 0 && <Chip tone="accent">{t("home.methods.fastest", "Sabse tez")}</Chip>}
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
        <div className="glass-surface glass-card--soft mt-7 flex flex-col items-start gap-5 p-5 [--surface-radius:20px] sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-3.5 text-[0.9375rem] leading-relaxed text-muted">
            <Seal icon={BadgeCheck} size="sm" />
            <span>
              <strong className="font-semibold text-ink">
                {t("home.methods.noInventTitle", "AI kabhi data invent nahi karta.")}
              </strong>{" "}
              {t(
                "home.methods.noInventBody",
                "Koi detail clear na ho to wo aapse poochega — apne aap bhar nahi dega.",
              )}
            </span>
          </p>
          <CtaGhost href={biodata.cta.href}>{biodata.cta.label}</CtaGhost>
        </div>
      </Reveal>
    </Panel>
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
    <Panel>
      <div className="grid gap-10 lg:grid-cols-[1fr_0.78fr] lg:items-start lg:gap-14">
        <div>
          <GoldLabel icon={ShieldCheck}>Trust &amp; verification</GoldLabel>

          <h2 className="bt-display mt-5 text-[1.85rem] sm:text-[2.35rem]">{verified.headline}</h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted">{verified.description}</p>

          <ul className="mt-6 grid gap-3">
            {verified.points.map((point) => (
              <li key={point} className="flex items-start gap-3.5">
                <Seal icon={BadgeCheck} size="sm" />
                <span className="pt-2 text-[0.9375rem] leading-relaxed text-ink">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-surface glass-card--soft flex flex-col items-center gap-6 p-5 [--surface-radius:22px] sm:p-7">
          <ProgressRing
            label="Trust Score"
            segments={[
              { key: "verify", label: "Verification", value: 82, color: "#37db96" },
              { key: "complete", label: "Completeness", value: 91, color: "#ffe487" },
              { key: "activity", label: "Activity", value: 74, color: "#a92f44" },
            ]}
            size={152}
          />

          {/* The ladder, as the reference would draw it: one pill per rung,
              the earned ones carrying a tick and the unearned ones an empty
              ring. Trust-by-design rule 2 — what is NOT verified shows too. */}
          <div className="chip-rail justify-center">
            {TRUST_LEVELS.map((item) => (
              <Chip key={item.label} className={cn(!item.done && "opacity-70")}>
                <span className={cn(item.done ? "text-ink" : "text-subtle")}>{item.label}</span>
                {item.done ? (
                  <Check className="size-3.5 text-trust" strokeWidth={3} />
                ) : (
                  <span className="size-3 rounded-full border-[1.5px] border-current opacity-60" />
                )}
              </Chip>
            ))}
          </div>

          <p className="text-center text-[0.6875rem] text-subtle">
            {t(
              "home.trust.unverifiedNote",
              "Jo verify nahi hua wo bhi dikhta hai — chhupaya nahi jaata",
            )}
          </p>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 6 · Journey                                                         */
/* ------------------------------------------------------------------ */

async function Journey({ steps }: { steps: HomePageViewModel["howItWorks"] }) {
  const t = await getT();
  return (
    <Panel>
      <div className="mx-auto max-w-2xl text-center">
        <GoldLabel>{t("home.journey.eyebrow", "Journey")}</GoldLabel>
        <h2 className="bt-display mt-5 text-[1.85rem] sm:text-[2.35rem]">
          {t("home.journey.title", "Register se safe connect tak.")}
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted">
          {t(
            "home.journey.description",
            "Har step pe AI batata hai ki abhi kya missing hai aur aage kya karna hai.",
          )}
        </p>
      </div>

      <RevealGroup className="mt-9 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <RevealItem key={step.step}>
            <div className="glass-surface glass-card--soft h-full p-5 [--surface-radius:20px]">
              {/* The step number in a seal — the reference's answer to "a
                  number that is an object rather than a heading". */}
              <span className="glass-seal grid size-10 place-items-center text-[0.9375rem] font-semibold text-gold">
                {String(step.step).padStart(2, "0")}
              </span>
              <h3 className="bt-display mt-4 text-[1.05rem] leading-snug lg:text-[1.15rem]">
                {step.title}
              </h3>
              <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">{step.description}</p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </Panel>
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
    <Panel>
      <div
        className={cn(
          "grid gap-10 lg:items-center lg:gap-14",
          earnings && "lg:grid-cols-[1fr_0.78fr]",
        )}
      >
        <div>
          <GoldLabel icon={Handshake}>Partner network</GoldLabel>

          <h2 className="bt-display mt-5 text-[1.85rem] sm:text-[2.35rem]">
            {t("home.partner.headlineLine1", "Ek baar refer kariye.")}
            <br />
            <span className="text-gold">{t("home.partner.headlineLine2", "Hamesha kamaiye.")}</span>
          </h2>

          <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted">
            {partner.description}
          </p>

          <div className="mt-6 grid gap-2.5">
            {partner.benefits.map((b) => (
              <div
                key={b.title}
                className="glass-surface glass-card--soft flex items-start gap-3.5 px-4 py-3.5 [--surface-radius:18px]"
              >
                <Seal icon={BadgeCheck} size="sm" />
                <div className="min-w-0">
                  <p className="text-[0.9375rem] font-semibold leading-snug text-ink">{b.title}</p>
                  <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">{b.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7">
            <CtaPrimary href={partner.cta.href}>
              {t("home.partner.cta", "Partner program dekhein")}
            </CtaPrimary>
          </div>
        </div>

        {/*
          * Earnings illustration — D-12 percentage, D-80 lifetime recurring.
          * Every figure comes from `earnings`, which lib/data/planData.ts
          * computes from the live plan prices and the live commission rate.
          */}
        {earnings && (
          <div className="glass-surface glass-card--soft p-5 [--surface-radius:22px] sm:p-6">
            <span className="gold-label">
              {t("home.partner.perUserLabel", "Ek referred user se")}
            </span>

            <p className="bt-numeral mt-2 text-[2.4rem]">
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

            <div className="glass-divide mt-5 space-y-2 pt-5">
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

            {/* The rate is uniform, the rupees are not — so everything on sale is
                listed rather than averaged away into one figure. */}
            <div className="glass-divide mt-5 pt-5">
              <span className="gold-label">
                {t("home.partner.perSpendLabel", "Kharid ke hisaab se")}
              </span>
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
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 8 · Safety                                                          */
/* ------------------------------------------------------------------ */

const SAFETY_ICONS = [Fingerprint, Lock, Eye, Users];

function Safety({ safety }: { safety: HomePageViewModel["safetyPreview"] }) {
  return (
    <Panel>
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div>
          <GoldLabel icon={ShieldCheck}>Safety</GoldLabel>
          <h2 className="bt-display mt-5 text-[1.85rem] sm:text-[2.35rem]">{safety.headline}</h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted">{safety.description}</p>
        </div>

        <RevealGroup className="grid gap-2.5">
          {safety.points.map((point, i) => {
            const Icon = SAFETY_ICONS[i % SAFETY_ICONS.length];
            return (
              <RevealItem key={point}>
                <div className="glass-surface glass-card--soft flex items-start gap-3.5 px-4 py-4 [--surface-radius:18px]">
                  <Seal icon={Icon} size="sm" />
                  <p className="pt-1.5 text-[0.9375rem] leading-relaxed text-muted">{point}</p>
                </div>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 9 · Final CTA                                                       */
/* ------------------------------------------------------------------ */

async function FinalCTA({ data }: { data: HomePageViewModel["finalCTA"] }) {
  const t = await getT();
  return (
    <Panel tone="lit" className="text-center sm:py-14">
      <Reveal className="mx-auto max-w-2xl">
        <GoldLabel icon={Sparkles}>{t("home.finalCta.badge", "Shuru kijiye")}</GoldLabel>

        <h2 className="bt-display mt-5 text-[1.95rem] sm:text-[2.6rem]">{data.headline}</h2>

        <p className="mx-auto mt-4 max-w-lg text-pretty leading-relaxed text-muted sm:text-[1.0625rem]">
          {data.description}
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <CtaPrimary href={data.primaryCTA.href}>{data.primaryCTA.label}</CtaPrimary>
          <CtaGhost href={data.secondaryCTA.href}>{data.secondaryCTA.label}</CtaGhost>
        </div>

        <p className="mt-6 text-[0.8125rem] text-subtle">
          {t("home.finalCta.footnote", "Registration free hai · Card details store nahi hoti")}
        </p>
      </Reveal>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

export default function HomePageView({ data }: Props) {
  return (
    <main>
      {/* The gap between panels is where the room shows, and it is the whole
          reason the page reads as glass standing in a place rather than as a
          tinted page. Narrower than the old paper layout on purpose: these
          panes have a lit edge, and two of them close together read as one
          object with a seam. */}
      <Container size="wide" className="flex flex-col gap-4 pb-16 pt-3 sm:gap-6 sm:pb-20 sm:pt-5">
        <Hero data={data.hero} />
        <CapabilityStrip />
        <RishtaReel />
        <ProfileMethods ai={data.aiProfileBuilder} biodata={data.biodataAutofill} />
        <TrustSection verified={data.verifiedProfile} />
        <Journey steps={data.howItWorks} />
        <Partner partner={data.partnerPreview} />
        <Safety safety={data.safetyPreview} />
        {/* Before the closing ask, not after it: somebody who is convinced
            enough to take the app is convinced enough to register, and the
            final CTA should stay the last thing on the page. */}
        {/* The APK line appears only when a release is really hosted — never
            a download button that leads nowhere. */}
        <HomeAppInstall androidApkHref={androidApkUrl() ? ANDROID_APK_DOWNLOAD_PATH : null} />
        <FinalCTA data={data.finalCTA} />
      </Container>
    </main>
  );
}
