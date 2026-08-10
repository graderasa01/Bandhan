"use client";

import { Sparkles } from "lucide-react";
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
 *
 * Phase H went one step further and stopped making the locked state a dead end
 * to `/user/subscription`. Both states now open the same scoped conversation —
 * the route decides what Grio may *say* about this rishta, and only the label
 * differs here, because the two versions genuinely do two different jobs:
 * without Premium Grio cannot read the profile at all, but it can still send
 * the interest, save the shortlist, or record the voice note, and it can still
 * answer "isse hoga kya" from code-computed facts. Selling the explanation is
 * the route's business (`ACTION_SCOPE_INSTRUCTIONS`), stated once inside the
 * conversation the user actually asked for.
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

  return (
    <Button
      variant="secondary"
      size="sm"
      fullWidth
      icon={<Sparkles className="size-4" />}
      onClick={() => open({ kind: "candidate", profileId, name })}
    >
      {canExplain
        ? t("profile.askGrioAboutRishta.cta", "Ask Grio about this rishta")
        : t("profile.askGrioAboutRishta.actionCta", "Ask Grio to do this for you")}
    </Button>
  );
}
