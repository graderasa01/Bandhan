"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import { useGrio } from "@/components/grio/GrioProvider";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Rishta Lens' one entry point.
 *
 * The locked state is a visible, honest control rather than a hidden one, and
 * that is the deliberate half of this component. Hiding the button from FREE
 * users would make the feature undiscoverable — nobody upgrades for something
 * they have never seen — but an upsell that implied the numbers above it were
 * also locked would be a lie, since the whole breakdown card ships to every
 * plan. So the copy names exactly what is behind the wall: the conversation,
 * not the reasoning.
 */
export default function AskGrioAboutRishtaButton({
  profileId,
  name,
  canExplain,
}: {
  profileId: string;
  name: string;
  canExplain: boolean;
}) {
  const { open } = useGrio();
  const t = useT();

  if (!canExplain) {
    return (
      <Link
        href="/user/subscription"
        className="flex items-center gap-3 rounded-lg border border-line bg-bg-subtle px-4 py-3 transition-colors hover:border-gold-300"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Lock className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-semibold text-ink">
            {t("profile.askGrioAboutRishta.lockedTitle", "Is rishtey par Grio se baat karein")}
          </span>
          <span className="block text-[0.8125rem] leading-snug text-muted">
            {t(
              "profile.askGrioAboutRishta.lockedDescription",
              "Upar ka poora hisaab aapko free me dikh raha hai. Grio se ispar baat-cheet Premium plan me khulti hai.",
            )}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      fullWidth
      icon={<Sparkles className="size-4" />}
      onClick={() => open({ kind: "candidate", profileId, name })}
    >
      {t("profile.askGrioAboutRishta.cta", "Ask Grio about this rishta")}
    </Button>
  );
}
