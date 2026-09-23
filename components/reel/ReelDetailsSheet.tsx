"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Blend,
  Briefcase,
  Check,
  ChevronRight,
  GraduationCap,
  Heart,
  HelpCircle,
  Home,
  Info,
  Leaf,
  MapPin,
  MessageCircle,
  Orbit,
  PenLine,
  Phone,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import ProgressRing from "@/components/ui/ProgressRing";
import KundliNoteList from "@/components/profile/KundliNoteList";
import ReelSnapSheet from "./ReelSnapSheet";
import type { InterestUi } from "./ProfileActionRail";
import type { ReelCardViewModel, ReelFact } from "@/lib/contracts/reel";
import type { ReelEmphasis } from "@/lib/reel/affinity";
import { profileGapLabel, profileSummaryLine, reelCautions, reelReasons } from "@/lib/reel/insights";
import { useT } from "@/components/i18n/LanguageProvider";

/** The sections a card can open the sheet straight onto. */
export type ReelDetailsSection = "about" | "family" | "lifestyle" | "expectations" | "why" | "kundli" | "verification" | "profile";

const sectionId = (s: ReelDetailsSection) => `reel-details-${s}`;

/**
 * The card's second page — everything that would crowd the face of a reel
 * card, in a sheet that opens at 60% so the person stays on screen above it.
 *
 * Every line here is data the card already carries (`ReelCardViewModel`); the
 * sheet fetches nothing. The order is progressive disclosure: a row of quick
 * facts, their own words, the grouped facts, then the app's reasoning
 * (deterministic first, the AI's phrasing visibly separate), then kundli,
 * trust and how complete the profile is.
 *
 * Three rules the layout enforces rather than a disclaimer:
 *
 *  - **An empty section is not rendered.** A heading for every blank group
 *    turned the old sheet into a list of what the app does not know; one line
 *    under "Profile" names the sections that are mostly empty instead.
 *  - **No percentage without evidence.** The ring shows the rank score only
 *    when a personal comparison exists; otherwise "Jaankari kam hai".
 *  - **Guna milan is a number only when it would be the real number** — both
 *    birth times, or the sentence that says why not.
 *
 * Personalisation may reorder the *sections* (a member who always reads the
 * family first finds it first, one who lives in Kundli finds it second) — it
 * never hides one.
 */
export default function ReelDetailsSheet({
  open,
  onClose,
  card,
  section = null,
  emphasis,
  interest,
  onInterest,
  onNotNow,
  onKundli,
  onAskGrio,
  onAskAi,
  onAskPerson,
  onAddNote,
  onSectionSeen,
}: {
  open: boolean;
  onClose: () => void;
  card: ReelCardViewModel | null;
  /** Open straight onto one section (the card's "86% profile" opens Profile). */
  section?: ReelDetailsSection | null;
  emphasis: ReelEmphasis;
  /** The same state the rail shows — one interest, one truth, two buttons. */
  interest: InterestUi;
  onInterest: () => void;
  /** "Not now" — the labelled taste signal. Absent inside a lane and on a matched card. */
  onNotNow?: () => void;
  onKundli: () => void;
  /** The full scoped conversation (Rishta Lens) — Grio, already knowing who this is. */
  onAskGrio: () => void;
  /** The plan's quick, quota'd question about this profile's facts (`/api/reel/ask`). */
  onAskAi?: () => void;
  /** Ask Bridge — one real question *to the person*, ever. Omitted when the feature is off. */
  onAskPerson?: () => void;
  /** An interest is out: a note can still ride along with it. */
  onAddNote?: () => void;
  /** A section genuinely read — the behavioural layer learns what this member looks for. */
  onSectionSeen?: (section: ReelDetailsSection) => void;
}) {
  const t = useT();
  const nothing = t("reel.details.nothingKnown", "Is baat ki jaankari abhi nahi di gayi.");
  const bodyRef = useRef<HTMLDivElement>(null);

  // Deep link: scroll the requested section into view once the sheet is up.
  useEffect(() => {
    if (!open || !section) return;
    const timer = setTimeout(() => {
      document.getElementById(sectionId(section))?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 380);
    return () => clearTimeout(timer);
  }, [open, section, card?.id]);

  // "Opened family info" — counted once per open, and only when the family
  // section actually sat on screen long enough to be read.
  useEffect(() => {
    if (!open || !card || !onSectionSeen) return;
    const el = document.getElementById(sectionId("family"));
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let reported = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (reported) return;
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            reported = true;
            onSectionSeen("family");
          }, 1200);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [open, card, onSectionSeen]);

  if (!card) return <ReelSnapSheet open={false} onClose={onClose} ariaLabel="" header={null}>{null}</ReelSnapSheet>;

  const why = card.whyThisMatch;
  const reasons = reelReasons(card);
  const cautions = reelCautions(card, t);
  const reasonSet = new Set(reasons.map((r) => r.text.trim().toLowerCase()));
  // `card.strengths` is already empty when the cached explanation no longer
  // matches the current profiles (see reelData.ts) — so anything left here is
  // both fresh and not already said by a reason above it.
  const leftoverStrengths = card.strengths.filter((s) => !reasonSet.has(s.trim().toLowerCase()));
  const lowInfo = card.rankScore === null;
  const showKundli = Boolean(card.kundli.milan || card.kundli.note || card.kundli.notes.length > 0);
  const summary = profileSummaryLine(card);

  const GROUPS: { key: ReelFact["group"]; section: ReelDetailsSection; title: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: "family", section: "family", title: t("reel.details.family", "Family"), icon: Users },
    { key: "lifestyle", section: "lifestyle", title: t("reel.details.lifestyle", "Lifestyle"), icon: Leaf },
    { key: "expectation", section: "expectations", title: t("reel.details.expectations", "Expectations"), icon: Home },
  ];

  /* ── Sections, as renderable blocks, so emphasis can reorder them ── */
  const about =
    card.bioNote ? (
      <Section key="about" id="about" icon={UserRound} title={t("reel.details.about", "About")}>
        <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink">{card.bioNote}</p>
      </Section>
    ) : null;

  const factSections = GROUPS.map(({ key, section: s, title, icon }) => {
    const rows = card.facts.filter((f) => f.group === key);
    if (rows.length === 0) return null;
    return (
      <Section key={s} id={s} icon={icon} title={title}>
        <dl className="divide-y divide-line/70">
          {rows.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
              <dt className="shrink-0 text-[0.8125rem] text-muted">{f.label}</dt>
              <dd className="min-w-0 text-right text-[0.9375rem] font-medium leading-snug text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Section>
    );
  });
  const [familySection, lifestyleSection, expectationSection] = factSections;
  const noFacts =
    card.facts.length === 0 ? (
      <Section key="nofacts" id="family" icon={Users} title={t("reel.details.aboutHeading", "Inke baare me")}>
        <p className="text-[0.9375rem] leading-snug text-muted">
          {t("reel.details.noFactsYet", "Inhone abhi family, lifestyle ya expectations ki jaankari nahi di hai.")}
        </p>
      </Section>
    ) : null;

  const whySection = (
    <Section key="why" id="why" icon={Blend} title={t("reel.details.whyHeading", "Why this match?")}>
      <div className="flex items-start gap-3">
        <ProgressRing size={52} thickness={5} segments={lowInfo ? [] : card.segments} unknown={lowInfo} glow={!lowInfo}>
          {lowInfo ? (
            <span className="px-1 text-center text-[0.5rem] font-semibold uppercase leading-tight tracking-wide text-muted">
              {t("reel.card.lowInfo", "Jaankari kam hai")}
            </span>
          ) : (
            <>
              <span className="font-[family-name:var(--font-display)] text-[0.9375rem] leading-none text-ink">{card.rankScore}</span>
              <span className="mt-0.5 text-[0.4375rem] font-semibold uppercase tracking-wider text-muted">
                {t("reel.card.rankLabel", "Rank")}
              </span>
            </>
          )}
        </ProgressRing>
        <div className="min-w-0 flex-1">
          {reasons.length > 0 ? (
            <ul className="space-y-1.5">
              {reasons.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[0.9375rem] leading-snug text-ink">
                  {line.ai ? (
                    <Sparkles className="mt-1 size-3.5 shrink-0 text-wine-700 dark:text-wine-300" aria-hidden />
                  ) : (
                    <Check className="mt-1 size-3.5 shrink-0 text-gold-700" aria-hidden />
                  )}
                  <span className="min-w-0">
                    {line.text}
                    {line.ai && <AiTag />}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.9375rem] leading-snug text-muted">{nothing}</p>
          )}
        </div>
      </div>

      {cautions.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {cautions.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[0.875rem] leading-snug text-ink">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
              <span className="min-w-0">
                {c.text}
                {c.ai && <AiTag />}
              </span>
            </li>
          ))}
        </ul>
      )}

      {why.starter && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-bg-subtle px-3 py-2 text-[0.875rem] leading-snug text-ink">
          <MessageCircle className="mt-0.5 size-3.5 shrink-0 text-wine-700 dark:text-wine-300" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[0.75rem] font-medium text-muted">{t("reel.details.starter", "Baat shuru karein")}</span>
            {why.starter}
          </span>
        </p>
      )}

      {/* What the number is — and is not. */}
      <p className="mt-2.5 flex items-start gap-1.5 text-[0.75rem] leading-snug text-subtle">
        <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
        <span>
          {lowInfo
            ? t(
                "reel.details.rankLowInfo",
                "Is jodi par abhi koi personal tulna nahi ban paayi — na aapki pasand se, na soch se — isliye yahan koi percentage nahi hai.",
              )
            : t(
                "reel.details.rankMeaning",
                "Rank score aapki batayi pasand, soch ka mel, trust aur activity ka mila-jula hisaab hai — ye rishtey ki koi guarantee ya compatibility ka percentage nahi.",
              )}
        </span>
      </p>

      {/* Two ways to ask, and they are not the same question: Grio reads this
          profile's facts and answers you; "Ask Something" sends a real
          question to the person, once. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAskGrio}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[0.875rem] font-semibold text-accent-fg transition-transform active:scale-95"
        >
          <Sparkles className="size-4 shrink-0" aria-hidden />
          {t("reel.actionBar.askGrio", "Ask Grio")}
        </button>
        {onAskAi && (
          <button
            type="button"
            onClick={onAskAi}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-bg-subtle"
          >
            <HelpCircle className="size-4 shrink-0" aria-hidden />
            {t("reel.details.quickQuestion", "Quick Question")}
          </button>
        )}
        {onAskPerson && card.askedStatus === "NONE" && (
          <button
            type="button"
            onClick={onAskPerson}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-bg-subtle"
          >
            <PenLine className="size-4 shrink-0" aria-hidden />
            {t("reel.card.askSomething", "Ask Something")}
          </button>
        )}
      </div>
    </Section>
  );

  const kundliSection = showKundli ? (
    <Section key="kundli" id="kundli" icon={Orbit} title={t("reel.details.kundli", "Kundli")}>
      <button
        type="button"
        onClick={onKundli}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-left text-ink transition-colors hover:border-gold-400 hover:bg-gold-50/50 dark:hover:bg-gold-900/20"
      >
        <span className="min-w-0">
          <span className="block text-[0.9375rem] font-semibold">
            {card.kundli.milan
              ? `${t("reel.details.gunaMilan", "Guna Milan")}: ${card.kundli.milan.total}/${card.kundli.milan.max} · ${card.kundli.milan.band}`
              : t("reel.details.gunaMilan", "Guna Milan")}
          </span>
          <span className="block text-[0.8125rem] leading-snug text-muted">
            {card.kundli.milan
              ? t("reel.details.gunaMilanHint2", "Parampara ka ek nazariya — rishta ka faisla nahi.")
              : card.kundli.note}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
      <KundliNoteList notes={card.kundli.notes} className="mt-3" />
    </Section>
  ) : null;

  const verificationSection = (
    <Section key="verification" id="verification" icon={ShieldCheck} title={t("reel.details.verification", "Verification")}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={card.verified ? "trust" : "neutral"} size="md" className={!card.verified ? "border-dashed" : undefined}>
          <BadgeCheck />
          {card.verified ? t("reel.trustStrip.photoVerified", "Photo Verified") : t("reel.trustStrip.photoPending", "Photo Pending")}
        </Pill>
        <Pill tone={card.mobileVerified ? "trust" : "neutral"} size="md" className={!card.mobileVerified ? "border-dashed" : undefined}>
          <Phone />
          {card.mobileVerified
            ? t("reel.trustStrip.mobileVerified", "Mobile Verified")
            : t("reel.trustStrip.mobilePending", "Mobile Pending")}
        </Pill>
      </div>
      {card.trustScore !== null && (
        <p className="mt-2 text-[0.875rem] leading-snug text-muted">
          {t("reel.details.trustScore", "Trust score")}: <span className="font-medium text-ink">{card.trustScore}/100</span>
        </p>
      )}
    </Section>
  );

  const depth = card.completeness.percent;
  const profileSection = (
    <Section key="profile" id="profile" icon={Star} title={t("reel.details.profileDepth", "Profile")}>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600" style={{ width: `${depth}%` }} />
        </div>
        <span className="shrink-0 text-[0.875rem] font-semibold tabular-nums text-ink">
          {t("reel.details.profileDepthValue", "{n}% bhari hui").replace("{n}", String(depth))}
        </span>
      </div>
      <p className="mt-2 text-[0.8125rem] leading-snug text-muted">
        {card.completeness.gaps.length > 0
          ? t("reel.details.profileGaps", "Abhi nahi bhara: {gaps}").replace(
              "{gaps}",
              card.completeness.gaps.map((g) => profileGapLabel(g, t)).join(", "),
            )
          : t("reel.details.profileNoGaps", "Har zaroori hissa bhara hua hai.")}
      </p>
    </Section>
  );

  const commonGround =
    card.sharedTags.length > 0 ? (
      <Section key="common" icon={Heart} title={t("reel.details.commonGround", "Common ground")}>
        <div className="flex flex-wrap gap-1.5">
          {card.sharedTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-gold-300/50 bg-gold-50 px-2.5 py-1 text-[0.8125rem] font-medium text-gold-700 dark:border-gold-700/40 dark:bg-gold-900/20 dark:text-gold-200"
            >
              {tag}
            </span>
          ))}
        </div>
      </Section>
    ) : null;

  const aiSection =
    leftoverStrengths.length > 0 ? (
      <Section key="ai" icon={Sparkles} title={t("reel.details.aiHeading", "AI ne dekha")}>
        <ul className="space-y-1.5">
          {leftoverStrengths.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-[0.9375rem] leading-snug text-ink">
              <Sparkles className="mt-1 size-3.5 shrink-0 text-wine-700 dark:text-wine-300" aria-hidden />
              <span className="min-w-0">{s}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[0.75rem] leading-snug text-subtle">
          {t(
            "reel.details.aiGrounded",
            "Ye AI ki apni shabdon me likhi baat hai — sirf upar dikh rahe profile facts se, koi andaaza ya personality ka daawa nahi.",
          )}
        </p>
      </Section>
    ) : null;

  // Default reading order, then the member's own habits move one section up.
  // Only an order — nothing is ever hidden because of a habit.
  const ordered: ReactNode[] = emphasis.familyFirst
    ? [familySection, about, emphasis.kundliFirst ? kundliSection : null, lifestyleSection, expectationSection]
    : [about, emphasis.kundliFirst ? kundliSection : null, familySection, lifestyleSection, expectationSection];
  ordered.push(noFacts, whySection, commonGround, emphasis.kundliFirst ? null : kundliSection, verificationSection, profileSection, aiSection);

  const primary = primaryFor(interest, t);

  return (
    <ReelSnapSheet
      open={open}
      onClose={onClose}
      ariaLabel={`${card.displayName}${card.age ? `, ${card.age}` : ""}`}
      expandKey={open && section ? `${card.id}:${section}` : null}
      header={
        <div className="flex items-center gap-3">
          <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-grad-photo ring-2 ring-gold-300/60">
            {card.photoUnlocked && card.photoUrl ? (
              <Image src={card.photoUrl} alt="" fill unoptimized className="object-cover" style={{ objectPosition: `50% ${card.photoFocalY ?? 30}%` }} />
            ) : (
              <span aria-hidden className="grid size-full place-items-center text-[1rem] font-semibold text-white">
                {card.displayName.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-1 truncate font-[family-name:var(--font-display)] text-[1.125rem] font-bold leading-tight text-ink">
              <span className="truncate">
                {card.displayName}
                {card.age ? `, ${card.age}` : ""}
              </span>
              {(card.verified || card.mobileVerified) && <BadgeCheck className="size-4 shrink-0 fill-trust text-white" aria-hidden />}
            </h3>
            {summary && <p className="truncate text-[0.8125rem] text-muted">{summary}</p>}
          </div>
        </div>
      }
      footer={
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Link href={`/user/profile/${card.id}`} className="flex-1">
              <Button variant="secondary" size="md" fullWidth>
                {t("reel.details.fullProfile", "Full Profile")}
              </Button>
            </Link>
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              icon={<primary.icon className="size-4" />}
              disabled={primary.disabled}
              onClick={onInterest}
            >
              {primary.label}
            </Button>
          </div>
          {onAddNote && (interest === "sent" || interest === "syncing") && (
            <button
              type="button"
              onClick={onAddNote}
              className="mx-auto inline-flex min-h-10 items-center gap-1.5 text-[0.875rem] font-medium text-primary-text"
            >
              <PenLine className="size-4 shrink-0" aria-hidden />
              {t("reel.details.addNote", "Add a Note")}
            </button>
          )}
          {/* "Not now" — the labelled taste signal (§4.5). Quiet, on its own
              line: it is the least of the things this sheet can do. */}
          {onNotNow && interest === "idle" && (
            <button
              type="button"
              onClick={onNotNow}
              className="mx-auto inline-flex min-h-10 items-center gap-1.5 text-[0.875rem] font-medium text-muted transition-colors hover:text-ink"
            >
              <X className="size-4 shrink-0" aria-hidden />
              {t("reel.details.notNow", "Not now — ye rishta abhi nahi")}
            </button>
          )}
        </div>
      }
    >
      <div ref={bodyRef} className="pb-2">
        {/* ── At a glance: the facts that are already on the card, as chips ── */}
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {card.profession && <QuickFact icon={Briefcase}>{card.profession}</QuickFact>}
          {card.education && <QuickFact icon={GraduationCap}>{card.education}</QuickFact>}
          {card.city && <QuickFact icon={MapPin}>{card.city}</QuickFact>}
          {depth > 0 && (
            <QuickFact icon={Star}>{t("reel.details.profileDepthChip", "{n}% profile").replace("{n}", String(depth))}</QuickFact>
          )}
        </ul>
        {ordered.filter(Boolean)}
      </div>
    </ReelSnapSheet>
  );
}

/** What the sheet's primary button says for each interest state — the rail's words, at footer size. */
function primaryFor(interest: InterestUi, t: ReturnType<typeof useT>) {
  switch (interest) {
    case "matched":
      return { label: t("reel.details.message", "Message"), icon: MessageCircle, disabled: false };
    case "failed":
      return { label: t("reel.details.retryInterest", "Retry Interest"), icon: RotateCw, disabled: false };
    case "pending":
    case "syncing":
    case "sent":
      return { label: t("reel.details.interestSent", "Interest Sent"), icon: Check, disabled: interest !== "pending" };
    default:
      // Users, not a heart — this sends a formal interest another family may read.
      return { label: t("reel.details.sendInterest", "Send Interest"), icon: Users, disabled: false };
  }
}

function QuickFact({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <li className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-bg-subtle px-2.5 py-1 text-[0.8125rem] font-medium text-ink">
      <Icon className="size-3.5 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

function AiTag() {
  const t = useT();
  return (
    <span className="ml-1.5 rounded-sm border border-wine-300/60 px-1 align-middle text-[0.5625rem] font-semibold uppercase tracking-wide text-wine-700 dark:border-wine-700/50 dark:text-wine-300">
      {t("reel.card.aiTag", "AI")}
    </span>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  /** Only the sections a card can deep-link to carry an anchor — ids must be unique. */
  id?: ReelDetailsSection;
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id ? sectionId(id) : undefined} className="scroll-mt-2 border-t border-line py-3.5 first:border-t-0 first:pt-0">
      <h4 className="flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wider text-primary-text">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}
