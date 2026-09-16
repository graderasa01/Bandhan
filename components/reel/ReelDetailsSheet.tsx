"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Check,
  ChevronRight,
  Heart,
  HelpCircle,
  Home,
  Info,
  Leaf,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import ProgressRing from "@/components/ui/ProgressRing";
import KundliNoteList from "@/components/profile/KundliNoteList";
import { cn } from "@/lib/utils";
import type { ReelCardViewModel, ReelFact, ReelSwipeDirection } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The card's second page — everything that would crowd the face of a reel
 * card, in a premium bottom sheet.
 *
 * Every line here is data the card already carries (`ReelCardViewModel`);
 * the sheet fetches nothing. Reading order is progressive disclosure: the
 * person's current facts first, then the deterministic "Why this match?"
 * layer from `whyThisMatch.ts`, then — only when it is still grounded in the
 * current profiles — the AI's own phrasing, visibly separate from the facts.
 *
 * Three rules the layout enforces rather than a disclaimer:
 *
 *  - **An empty section is not rendered.** A "Family — Is baat ki jaankari
 *    abhi nahi di gayi" heading for every blank group turned the sheet into a
 *    list of what the app does not know. One honest line under "Abhi clear
 *    nahi" names the single most decisive gap instead.
 *  - **No percentage without evidence.** The ring shows the rank score only
 *    when a personal comparison exists; otherwise "Jaankari kam hai".
 *  - **Guna milan is a number only when it would be the real number.** Both
 *    birth times, or the sentence that says why not — never a total that
 *    looks final over a noon-assumed Moon.
 */
export default function ReelDetailsSheet({
  open,
  onClose,
  card,
  onAction,
  onAskAi,
  onAskPerson,
}: {
  open: boolean;
  onClose: () => void;
  card: ReelCardViewModel | null;
  /** Same handler the action bar uses — a decision from here is a decision. */
  onAction?: (direction: ReelSwipeDirection) => void;
  /**
   * The plan's own `aiAskPerDay` product — a quick, quota'd question answered
   * from this candidate's L1 facts (`/api/reel/ask`).
   *
   * It lives here rather than on the face of the card because the card's "Ask
   * Grio" is a different thing: the full scoped conversation, which can also
   * act. Two AI buttons on one photograph would make a reader choose between
   * things they have no way to tell apart; here, next to the facts the answer
   * comes from, the quick question explains itself.
   */
  onAskAi?: () => void;
  /** Ask Bridge — a real question *to the person*, capped at one, ever. Omitted (not disabled) when the feature is off. */
  onAskPerson?: () => void;
}) {
  const t = useT();
  const nothing = t("reel.details.nothingKnown", "Is baat ki jaankari abhi nahi di gayi.");

  const why = card?.whyThisMatch ?? { reasons: [], valueConnection: null, unclear: null, starter: null };
  const reasonSet = new Set(why.reasons.map((r) => r.text.trim().toLowerCase()));
  // `card.strengths` is already empty when the cached explanation no longer
  // matches the current profiles (see reelData.ts) — so anything left here is
  // both fresh and not already said by a fact line above it.
  const leftoverStrengths = (card?.strengths ?? []).filter((s) => !reasonSet.has(s.trim().toLowerCase()));

  const GROUPS: { key: ReelFact["group"]; title: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: "family", title: t("reel.details.family", "Family"), icon: Users },
    { key: "lifestyle", title: t("reel.details.lifestyle", "Lifestyle"), icon: Leaf },
    { key: "expectation", title: t("reel.details.expectations", "Expectations"), icon: Home },
  ];

  const subtitle = card ? [card.city, card.profession ?? card.education].filter(Boolean).join(" · ") : "";
  const lowInfo = Boolean(card && card.rankScore === null);
  const showKundli = Boolean(card && (card.kundli.milan || card.kundli.note || card.kundli.notes.length > 0));
  const hasWhy = Boolean(why.reasons.length > 0 || why.valueConnection || why.unclear || why.starter || card?.concern);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={card ? `${card.displayName}${card.age ? `, ${card.age}` : ""}` : ""}
      description={subtitle || undefined}
      footer={
        card ? (
          <div className="flex gap-2">
            <Link href={`/user/profile/${card.id}`} className="flex-1">
              <Button variant="secondary" size="md" fullWidth>
                {t("reel.details.fullProfile", "Full Profile")}
              </Button>
            </Link>
            {onAction && (
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                // Users, not a heart — same reason ReelActionBar changed: this
                // sends a formal interest another family may read.
                icon={<Users className="size-4" />}
                onClick={() => {
                  onClose();
                  onAction("RIGHT");
                }}
              >
                {t("reel.details.sendInterest", "Send Interest")}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {card && (
        <div className="pb-2">
          {/* ── Two ways to ask, and they are not the same question ──────
              "AI se poochein" reads this profile's facts and answers you.
              "Ask Something" sends a real question to the person, once. */}
          {(onAskAi || onAskPerson) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {onAskAi && (
                <button
                  type="button"
                  onClick={onAskAi}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-wine-200 bg-wine-50 px-3.5 text-[0.875rem] font-semibold text-wine-700 transition-colors hover:bg-wine-100 dark:border-wine-700/40 dark:bg-wine-900/30 dark:text-wine-200"
                >
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                  {t("reel.details.askAi", "AI se poochein")}
                </button>
              )}
              {onAskPerson && card.askedStatus === "NONE" && (
                <button
                  type="button"
                  onClick={onAskPerson}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[0.875rem] font-semibold text-ink transition-colors hover:border-gold-400 hover:bg-gold-50 dark:hover:bg-gold-900/20"
                >
                  <HelpCircle className="size-4 shrink-0" aria-hidden />
                  {t("reel.card.askSomething", "Ask Something")}
                </button>
              )}
              {card.askedStatus === "PENDING" && (
                <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-[0.875rem] text-subtle">
                  <HelpCircle className="size-4 shrink-0" aria-hidden />
                  {t("reel.card.questionAsked", "Sawaal poocha hua hai")}
                </span>
              )}
            </div>
          )}

          {/* ── The facts, first — current profile data, grouped, empty groups hidden ── */}
          {GROUPS.map(({ key, title, icon }) => {
            const rows = card.facts.filter((f) => f.group === key);
            if (rows.length === 0) return null;
            return (
              <Section key={key} icon={icon} title={title}>
                <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-1.5">
                  {rows.map((f) => (
                    <div key={f.label} className="contents">
                      <dt className="text-[0.875rem] leading-snug text-muted">{f.label}</dt>
                      <dd className="min-w-0 text-[1rem] leading-snug text-ink">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            );
          })}
          {card.facts.length === 0 && (
            <Section icon={Users} title={t("reel.details.aboutHeading", "Inke baare me")}>
              <p className="text-[1rem] leading-snug text-muted">
                {t("reel.details.noFactsYet", "Inhone abhi family, lifestyle ya expectations ki jaankari nahi di hai.")}
              </p>
            </Section>
          )}

          {/* ── Why this match? — code's comparison, the ring, the honest gaps ── */}
          <Section icon={Sparkles} title={t("reel.details.whyHeading", "Why this match?")}>
            <div className="flex items-start gap-3">
              <ProgressRing size={56} thickness={5} segments={lowInfo ? [] : card.segments} unknown={lowInfo} glow={!lowInfo}>
                {lowInfo ? (
                  <span className="px-1 text-center text-[0.5rem] font-semibold uppercase leading-tight tracking-wide text-muted">
                    {t("reel.card.lowInfo", "Jaankari kam hai")}
                  </span>
                ) : (
                  <>
                    <span className="font-[family-name:var(--font-display)] text-[0.9375rem] leading-none text-ink">
                      {card.rankScore}
                    </span>
                    <span className="mt-0.5 text-[0.4375rem] font-semibold uppercase tracking-wider text-muted">
                      {t("reel.card.rankLabel", "Rank")}
                    </span>
                  </>
                )}
              </ProgressRing>
              <div className="min-w-0 flex-1">
                {why.reasons.length > 0 ? (
                  <ul className="space-y-1.5">
                    {why.reasons.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-[1rem] leading-snug text-ink">
                        {line.kind === "ai" ? (
                          <Sparkles className="mt-1 size-3.5 shrink-0 text-wine-700 dark:text-wine-300" aria-hidden />
                        ) : (
                          <Check className="mt-1 size-3.5 shrink-0 text-gold-700" aria-hidden />
                        )}
                        <span className="min-w-0">
                          {line.text}
                          {line.kind === "ai" && (
                            <span className="ml-1.5 rounded-sm border border-wine-300/60 px-1 align-middle text-[0.5625rem] font-semibold uppercase tracking-wide text-wine-700 dark:border-wine-700/50 dark:text-wine-300">
                              {t("reel.card.aiTag", "AI")}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[1rem] leading-snug text-muted">{nothing}</p>
                )}
              </div>
            </div>

            {/* What the number is — and is not. A rank score orders today's
                reel; it is never a probability that two people fit. */}
            <p className="mt-2.5 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-subtle">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
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
            {card.preference.note && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-muted">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{card.preference.note}</span>
              </p>
            )}

            {why.valueConnection && (
              <Slot icon={Heart} label={t("reel.details.valueConnection", "Value connection")} tone="gold">
                {why.valueConnection}
              </Slot>
            )}
            {(why.unclear || card.concern) && (
              <Slot icon={AlertCircle} label={t("reel.details.unclear", "Abhi clear nahi")} tone="warn">
                {why.unclear}
                {card.concern && (
                  <span className={cn("block", why.unclear && "mt-1")}>
                    {card.concern}
                    <span className="ml-1.5 rounded-sm border border-wine-300/60 px-1 align-middle text-[0.5625rem] font-semibold uppercase tracking-wide text-wine-700 dark:border-wine-700/50 dark:text-wine-300">
                      {t("reel.card.aiTag", "AI")}
                    </span>
                  </span>
                )}
              </Slot>
            )}
            {why.starter && (
              <Slot icon={MessageCircle} label={t("reel.details.starter", "Baat shuru karein")} tone="wine">
                {why.starter}
              </Slot>
            )}
            {!hasWhy && <p className="mt-3 text-[0.875rem] leading-snug text-muted">{nothing}</p>}
          </Section>

          {/* ── AI ne dekha — only fresh, only what the facts above did not already say ── */}
          {leftoverStrengths.length > 0 && (
            <Section icon={Sparkles} title={t("reel.details.aiHeading", "AI ne dekha")}>
              <ul className="space-y-1.5">
                {leftoverStrengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[1rem] leading-snug text-ink">
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
          )}

          {/* ── Verification ────────────────────────────────────────────── */}
          <Section icon={ShieldCheck} title={t("reel.details.verification", "Verification")}>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={card.verified ? "trust" : "neutral"} size="md" className={!card.verified ? "border-dashed" : undefined}>
                <BadgeCheck />
                {card.verified
                  ? t("reel.trustStrip.photoVerified", "Photo Verified")
                  : t("reel.trustStrip.photoPending", "Photo Pending")}
              </Pill>
              <Pill
                tone={card.mobileVerified ? "trust" : "neutral"}
                size="md"
                className={!card.mobileVerified ? "border-dashed" : undefined}
              >
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

          {/* ── Common ground — deterministic overlap, never AI (D-32) ───── */}
          {card.sharedTags.length > 0 && (
            <Section icon={Star} title={t("reel.details.commonGround", "Common ground")}>
              <div className="flex flex-wrap gap-1.5">
                {card.sharedTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-gold-300/50 bg-gold-50 px-2.5 py-1 text-[0.875rem] font-medium text-gold-700 dark:border-gold-700/40 dark:bg-gold-900/20 dark:text-gold-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* ── Kundli — display only, never a ranking input ─────────────── */}
          {showKundli && (
            <Section icon={HelpCircle} title={t("reel.details.kundli", "Kundli")}>
              {card.kundli.milan ? (
                <Link
                  href={`/user/profile/${card.id}#kundli`}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-ink transition-colors hover:border-gold-400 hover:bg-gold-50/50"
                >
                  <span className="min-w-0">
                    <span className="block text-[0.9375rem] font-semibold">
                      {t("reel.details.gunaMilan", "Guna Milan")}: {card.kundli.milan.total}/{card.kundli.milan.max} · {card.kundli.milan.band}
                    </span>
                    <span className="block text-[0.8125rem] leading-snug text-muted">
                      {t("reel.details.gunaMilanHint", "Parampara ka ek nazariya — rishta ka faisla nahi. Poora hisaab profile par.")}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              ) : (
                card.kundli.note && (
                  <p className="flex items-start gap-1.5 text-[0.875rem] leading-snug text-muted">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{card.kundli.note}</span>
                  </p>
                )
              )}
              <KundliNoteList notes={card.kundli.notes} className={card.kundli.milan || card.kundli.note ? "mt-3" : "mt-0"} />
            </Section>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-4 mt-4 first:mt-0 first:border-t-0 first:pt-0">
      <h4 className="flex items-center gap-1.5 text-[0.875rem] font-semibold uppercase tracking-wider text-primary-text">
        <Icon className="size-4" aria-hidden />
        {title}
      </h4>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Slot({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone: "gold" | "warn" | "wine";
  children: ReactNode;
}) {
  return (
    <div className="mt-3 flex items-start gap-2">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "gold" && "text-gold-700",
          tone === "warn" && "text-warn",
          tone === "wine" && "text-wine-700 dark:text-wine-300",
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-[0.875rem] font-medium text-muted">{label}</p>
        <p className="text-[1rem] leading-snug text-ink">{children}</p>
      </div>
    </div>
  );
}
