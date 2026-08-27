import Link from "next/link";
import { Lock, Settings2, Sparkles } from "lucide-react";
import { getT } from "@/lib/i18n/server";

interface Props {
  entitled: boolean;
  reelCount: number;
  filterMode: "FLEXIBLE" | "STRICT";
  behaviorState: "paused" | "collecting" | "active" | "not_entitled";
}

const BEHAVIOR_LABEL: Record<Props["behaviorState"], string> = {
  active: "Seekh raha hai",
  collecting: "Data collect ho raha hai",
  paused: "Paused",
  not_entitled: "Paid plan par",
};

/**
 * One compact Advanced Discovery surface for the dashboard — deliberately a
 * single row, not another full card, per the brief's "do not add several
 * large new cards". Sits with the reel hero it summarises rather than in its
 * own section.
 */
export default async function SmartMatchesCard({ entitled, reelCount, filterMode, behaviorState }: Props) {
  const t = await getT();

  return (
    <Link
      href="/user/discover"
      className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-gold-500"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-wine-100 text-wine-700 dark:bg-wine-900/30 dark:text-wine-300">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-semibold text-ink">
          {t("dashboard.smartMatches.title", "Smart Matches")}
          {!entitled && <Lock className="ml-1.5 inline size-3 text-subtle" aria-hidden />}
        </p>
        <p className="truncate text-[0.75rem] text-muted">
          {entitled
            ? `${reelCount} ${t("dashboard.smartMatches.today", "aaj")} · ${filterMode === "STRICT" ? t("dashboard.smartMatches.strict", "Strict") : t("dashboard.smartMatches.flexible", "Flexible")} · ${BEHAVIOR_LABEL[behaviorState]}`
            : t("dashboard.smartMatches.locked", "Apna search aur Reel-preference set karein — plan upgrade se khulta hai")}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[0.75rem] font-semibold text-accent-text">
        <Settings2 className="size-3.5" />
        {t("dashboard.smartMatches.adjust", "Adjust filters")}
      </span>
    </Link>
  );
}
