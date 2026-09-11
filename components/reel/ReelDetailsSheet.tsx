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
 * the sheet fetches nothing. "Why this match?" is the deterministic layer from
 * `whyThisMatch.ts`; the AI's cached strengths appear only where they are not
 * already one of those reasons, and its concern sits honestly under
 * "Abhi clear nahi" next to the code-found gap.
 */
export default function ReelDetailsSheet({
  open,
  onClose,
  card,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  card: ReelCardViewModel | null;
  /** Same handler the action bar uses — a decision from here is a decision. */
  onAction?: (direction: ReelSwipeDirection) => void;
}) {
  const t = useT();
  const nothing = t("reel.details.nothingKnown", "Is baat par abhi information nahi hai.");

  const why = card?.whyThisMatch ?? { reasons: [], valueConnection: null, unclear: null, starter: null };
  const reasonSet = new Set(why.reasons.map((r) => r.trim().toLowerCase()));
  const leftoverStrengths = (card?.strengths ?? []).filter((s) => !reasonSet.has(s.trim().toLowerCase()));

  const GROUPS: { key: ReelFact["group"]; title: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: "family", title: t("reel.details.family", "Family"), icon: Users },
    { key: "lifestyle", title: t("reel.details.lifestyle", "Lifestyle"), icon: Leaf },
    { key: "expectation", title: t("reel.details.expectations", "Expectations"), icon: Home },
  ];

  const subtitle = card ? [card.city, card.profession ?? card.education].filter(Boolean).join(" · ") : "";
  const showKundli = Boolean(card && (card.kundliMilanAvailable || card.kundliNotes.length > 0));

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
                icon={<Heart className="size-4" />}
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
          {/* ── Why this match? ─────────────────────────────────────────── */}
          <Section icon={Sparkles} title={t("reel.details.whyHeading", "Why this match?")}>
            <div className="flex items-start gap-3">
              <ProgressRing size={56} thickness={5} segments={card.segments} glow>
                <span className="font-[family-name:var(--font-display)] text-[0.9375rem] leading-none text-ink">
                  {card.compatibility}%
                </span>
              </ProgressRing>
              <div className="min-w-0 flex-1">
                {why.reasons.length > 0 ? (
                  <ul className="space-y-1.5">
                    {why.reasons.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-[1rem] leading-snug text-ink">
                        <Check className="mt-1 size-3.5 shrink-0 text-gold-700" aria-hidden />
                        <span className="min-w-0">{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[1rem] leading-snug text-muted">{nothing}</p>
                )}
              </div>
            </div>

            <Slot icon={Heart} label={t("reel.details.valueConnection", "Value connection")} tone="gold">
              {why.valueConnection ?? nothing}
            </Slot>
            <Slot icon={AlertCircle} label={t("reel.details.unclear", "Abhi clear nahi")} tone="warn">
              {why.unclear ?? (card.concern ? null : nothing)}
              {card.concern && (
                <span className={cn("block", why.unclear && "mt-1")}>{card.concern}</span>
              )}
            </Slot>
            <Slot icon={MessageCircle} label={t("reel.details.starter", "Baat shuru karein")} tone="wine">
              {why.starter ?? nothing}
            </Slot>
          </Section>

          {/* ── AI ne dekha — only what the reasons above did not already say ── */}
          {leftoverStrengths.length > 0 && (
            <Section icon={Sparkles} title={t("reel.details.aiHeading", "AI ne dekha")}>
              <ul className="space-y-1.5">
                {leftoverStrengths.map((s, i) => (
                  <li key={i} className="text-[1rem] leading-snug text-ink">
                    {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* ── Family / Lifestyle / Expectations — L1 facts only ─────────── */}
          {GROUPS.map(({ key, title, icon }) => {
            const rows = card.facts.filter((f) => f.group === key);
            return (
              <Section key={key} icon={icon} title={title}>
                {rows.length > 0 ? (
                  <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-1.5">
                    {rows.map((f) => (
                      <div key={f.label} className="contents">
                        <dt className="text-[0.875rem] leading-snug text-muted">{f.label}</dt>
                        <dd className="min-w-0 text-[1rem] leading-snug text-ink">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-[1rem] leading-snug text-muted">{nothing}</p>
                )}
              </Section>
            );
          })}

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
              {card.kundliMilanAvailable && (
                <Link
                  href={`/user/profile/${card.id}`}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-line px-3 text-[0.9375rem] text-ink transition-colors hover:border-gold-400 hover:bg-gold-50/50"
                >
                  <span>{t("reel.details.kundliAvailable", "Kundli Milan available")}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              )}
              <KundliNoteList notes={card.kundliNotes} className={card.kundliMilanAvailable ? "mt-3" : "mt-0"} />
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
