import Link from "next/link";
import {
  ArrowRight,
  Baby,
  Brain,
  Briefcase,
  CalendarHeart,
  Check,
  HeartHandshake,
  Home,
  Landmark,
  ListChecks,
  MessagesSquare,
  Sunrise,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CornerFlourish } from "@/components/public/_shared/Ornaments";
import { getT } from "@/lib/i18n/server";
import { catalogKey } from "@/lib/i18n/catalogKeys";
import { cn } from "@/lib/utils";
import type { IntelligenceLayerKey } from "@/lib/profile/intelligenceQuestions";
import type { IntelligenceProgress } from "@/lib/services/profile/intelligenceService";

/**
 * The dashboard's answer to "kya Bandhan mujhe samajhta hai?".
 *
 * This sits where `ProfileCompletionCard` used to, and swallows it whole
 * (bottom row) rather than living next to it, because two progress bars side
 * by side is how a user learns to read neither. The order is the argument:
 * understanding is the headline, completion is the footnote — the reverse of
 * what a matrimony product usually shows, and the reverse of what this one
 * showed until now.
 *
 * ## Why "3 of 9 areas" and not "41%"
 *
 * A percentage over a question count is a number about the form. "9 areas" is
 * a number about the person — and the areas have names a user recognises
 * ("Bachche aur parenting"), so the gap it reports is a gap they can feel.
 *
 * ## Why the rail never reorders
 *
 * The nine layer icons are always in the same nine positions, whatever their
 * state. A rail that pushes finished areas to the end means the same area is
 * in a different place on every visit, so muscle memory never forms and the
 * user has to re-read the whole row each time.
 */

const LAYER_ICON: Record<IntelligenceLayerKey, LucideIcon> = {
  INTENT: CalendarHeart,
  FAMILY_LIFE: Home,
  CAREER: Briefcase,
  MONEY: Wallet,
  CHILDREN: Baby,
  LIFESTYLE: Sunrise,
  COMMUNICATION: MessagesSquare,
  VALUES: Landmark,
  PARTNER_PREFERENCES: HeartHandshake,
};

interface Props {
  intelligence: IntelligenceProgress;
  /** Profile Ready — the old completion number, kept honest and kept separate. */
  completionPercentage: number;
  missingFields: string[];
}

export default async function ProfileIntelligenceCard({
  intelligence,
  completionPercentage,
  missingFields,
}: Props) {
  const t = await getT();
  const { completedLayers, totalLayers, nextLayer, layers } = intelligence;
  const areaPercent = totalLayers === 0 ? 0 : Math.round((completedLayers / totalLayers) * 100);
  const remaining = nextLayer ? nextLayer.total - nextLayer.answered : 0;

  return (
    <div className="bt-card h-full overflow-hidden p-5 sm:p-6">
      {/* Drawn for a top-left corner, so it is mirrored into the top-right
          one. Flush with the edge, not inset: the two rules are the card's
          own corner, and a frame that stops short of it is a doodle. */}
      <CornerFlourish className="bt-vine right-0 top-0 size-20 -scale-x-100" />

      <div className="relative flex items-start gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
          <Brain className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="bt-display text-[1.3rem] leading-snug">
            {t("profile.intelligenceCard.title", "Profile Intelligence")}
          </h3>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            {t("profile.intelligenceCard.subtitle", "Bandhan aapko kitna samajhta hai")}
          </p>
        </div>
      </div>

      {/* Label above the bar, not inside it — at 6px a bar has no room for a
          number, and the count is the sentence people actually read. */}
      <div className="relative mt-5">
        <p className="text-[0.75rem] font-medium text-muted">
          {completedLayers} {t("profile.intelligenceCard.ofAreas", "of")} {totalLayers}{" "}
          {t("profile.intelligenceCard.areasUnderstood", "areas understood")}
        </p>
        <div
          role="progressbar"
          aria-valuenow={areaPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600 transition-[width] duration-700"
            style={{ width: `${areaPercent}%` }}
          />
        </div>
      </div>

      {/* Fixed positions, always all nine — see the docstring. */}
      <ul className="relative mt-5 flex flex-wrap gap-2.5">
        {layers.map((layer) => {
          const Icon = LAYER_ICON[layer.key];
          const started = layer.answered > 0;
          const layerTitle = t(catalogKey.layerTitle(layer.key), layer.title);
          return (
            <li key={layer.key}>
              <Link
                href={`/user/profile/intelligence/${layer.slug}`}
                title={`${layerTitle} — ${layer.answered}/${layer.total}`}
                aria-label={`${layerTitle}: ${layer.answered} of ${layer.total}`}
                className={cn(
                  "bt-ring relative [--paper-ring-size:2.5rem]",
                  layer.complete && "bt-ring--trust",
                  !layer.complete && started && "text-primary-text",
                  !layer.complete && !started && "text-subtle",
                )}
              >
                <Icon className="size-[18px]" />
                {layer.complete && (
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-trust text-white"
                  >
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {nextLayer ? (
        <div className="relative mt-6 rounded-2xl border border-gold-300/60 bg-gold-50/60 p-5 dark:border-gold-400/25 dark:bg-gold-900/15">
          <p className="bt-microlabel text-primary-text">
            {t("profile.intelligenceCard.next", "Next")}
          </p>
          <p className="bt-display mt-1.5 text-[1.15rem] leading-snug">
            {t(catalogKey.layerTitle(nextLayer.key), nextLayer.title)}
          </p>
          <p className="mt-1.5 text-[0.8125rem] text-muted">
            {remaining} {t("profile.intelligenceCard.smallQuestions", "chhote sawaal")} · ~
            {nextLayer.estimatedMinutes} {t("profile.intelligenceCard.minute", "minute")}
          </p>
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
            {t(catalogKey.layerUnlocks(nextLayer.key), nextLayer.unlocks)}.
          </p>
          <Link
            href={`/user/profile/intelligence/${nextLayer.slug}`}
            className="bt-cta mt-4 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[0.875rem] font-semibold transition-transform duration-200 hover:-translate-y-0.5"
          >
            {t("profile.intelligenceCard.cta", "Answer")} {remaining}{" "}
            {t("profile.intelligenceCard.ctaQuestions", "Questions")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <p className="relative mt-6 rounded-2xl border border-trust/30 bg-trust-bg p-5 text-[0.875rem] leading-relaxed text-ink">
          {t(
            "profile.intelligenceCard.allDone",
            "Saare 9 areas ho gaye — Bandhan ab aapki soch ke hisaab se rishte dhoondh raha hai.",
          )}
        </p>
      )}

      {/* Profile Ready — the old card's job, now the footnote it always was. */}
      <div className="relative mt-6 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8125rem] text-muted">
            <span className="font-semibold text-ink">
              {t("profile.intelligenceCard.profileReady", "Profile Ready")}
            </span>{" "}
            · <span className={cn(completionPercentage === 100 && "font-semibold text-trust")}>
              {completionPercentage}%
            </span>
            {missingFields.length > 0 && (
              <>
                {" "}
                · {missingFields.length} {t("profile.intelligenceCard.fieldsLeft", "baaki")}
              </>
            )}
          </p>
          <Link
            href="/profile/build?mode=manual"
            className="inline-flex min-h-9 items-center gap-1.5 text-[0.8125rem] font-semibold text-primary-text transition-colors hover:text-accent-text"
          >
            <ListChecks className="size-4" />
            {t("profile.intelligenceCard.fillFullForm", "Fill Full Profile Form")}
          </Link>
        </div>
        {missingFields.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {missingFields.slice(0, 6).map((f) => (
              <li
                key={f}
                className="rounded-full border border-warn/30 bg-warn-bg px-2.5 py-0.5 text-[0.75rem] text-warn"
              >
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
