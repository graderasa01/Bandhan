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
import Card from "@/components/ui/Card";
import Progress from "@/components/ui/Progress";
import { getT } from "@/lib/i18n/server";
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
    <Card variant="default" padding="lg">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
          <Brain className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-wine-700">
            {t("profile.intelligenceCard.title", "Profile Intelligence")}
          </h3>
          <p className="text-[0.8125rem] text-muted">
            {t("profile.intelligenceCard.subtitle", "Bandhan aapko kitna samajhta hai")}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Progress
          value={areaPercent}
          showPercentage={false}
          label={`${completedLayers} ${t("profile.intelligenceCard.ofAreas", "of")} ${totalLayers} ${t("profile.intelligenceCard.areasUnderstood", "areas understood")}`}
          variant="default"
        />
      </div>

      {/* Fixed positions, always all nine — see the docstring. */}
      <ul className="mt-4 flex flex-wrap gap-2">
        {layers.map((layer) => {
          const Icon = LAYER_ICON[layer.key];
          const started = layer.answered > 0;
          return (
            <li key={layer.key}>
              <Link
                href={`/user/profile/intelligence/${layer.slug}`}
                title={`${layer.title} — ${layer.answered}/${layer.total}`}
                aria-label={`${layer.title}: ${layer.answered} of ${layer.total}`}
                className={cn(
                  "relative grid size-10 place-items-center rounded-full border transition-colors",
                  layer.complete
                    ? "border-trust/40 bg-trust/10 text-trust"
                    : started
                      ? "border-gold-400/60 bg-gold-50 text-gold-700 dark:bg-gold-900/20"
                      : "border-line bg-surface text-subtle hover:border-gold-400 hover:text-gold-700",
                )}
              >
                <Icon className="size-4" />
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
        <div className="mt-5 rounded-lg border border-gold-300/50 bg-gold-50/60 p-4 dark:bg-gold-900/10">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gold-700">
            {t("profile.intelligenceCard.next", "Next")}
          </p>
          <p className="mt-0.5 text-[0.9375rem] font-semibold text-ink">{nextLayer.title}</p>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {remaining} {t("profile.intelligenceCard.smallQuestions", "chhote sawaal")} · ~
            {nextLayer.estimatedMinutes} {t("profile.intelligenceCard.minute", "minute")}
          </p>
          <p className="mt-1 text-[0.8125rem] text-muted">{nextLayer.unlocks}.</p>
          <Link
            href={`/user/profile/intelligence/${nextLayer.slug}`}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-4 text-sm font-semibold text-primary-fg shadow-sm transition-transform hover:-translate-y-0.5"
          >
            {t("profile.intelligenceCard.cta", "Answer")} {remaining}{" "}
            {t("profile.intelligenceCard.ctaQuestions", "Questions")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-trust/30 bg-trust/5 p-4 text-[0.875rem] text-ink">
          {t(
            "profile.intelligenceCard.allDone",
            "Saare 9 areas ho gaye — Bandhan ab aapki soch ke hisaab se rishte dhoondh raha hai.",
          )}
        </p>
      )}

      {/* Profile Ready — the old card's job, now the footnote it always was. */}
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8125rem] text-muted">
            <span className="font-semibold text-ink">
              {t("profile.intelligenceCard.profileReady", "Profile Ready")}
            </span>{" "}
            · {completionPercentage}%
            {missingFields.length > 0 && (
              <>
                {" "}
                · {missingFields.length} {t("profile.intelligenceCard.fieldsLeft", "baaki")}
              </>
            )}
          </p>
          <Link
            href="/profile/build?mode=manual"
            className="inline-flex min-h-9 items-center gap-1.5 text-[0.8125rem] font-medium text-primary-text hover:text-primary-hover"
          >
            <ListChecks className="size-4" />
            {t("profile.intelligenceCard.fillFullForm", "Fill Full Profile Form")}
          </Link>
        </div>
        {missingFields.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
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
    </Card>
  );
}
