import { Info } from "lucide-react";
import Progress from "@/components/ui/Progress";
import { MATCH_WEIGHTS } from "@/lib/services/match/pipeline";
import { getT } from "@/lib/i18n/server";

/**
 * The honest half of "kitna boost ho raha hai" — the exact
 * `scoreRecentActivity` numbers boost changes, computed by the same function
 * the live ranking pipeline calls (`lib/services/match/pipeline.ts`), not a
 * second display-only estimate that could quietly drift from what ranking
 * actually does. Real number, real cap, real weight — same discipline as
 * `DemandMeterCard`'s "a user who acts and doesn't see the number move would
 * never trust this card again."
 */
export default async function BoostScoreCompare({ base, boosted }: { base: number; boosted: number }) {
  const t = await getT();
  const weightPct = Math.round(MATCH_WEIGHTS.recentActivity * 100);

  return (
    <div>
      <p className="text-[0.9375rem] font-semibold text-ink">{t("boost.scoreCompare.title", "Asli number — dikhawa nahi")}</p>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
        {t(
          "boost.scoreCompare.subtitle",
          "Ye wahi formula hai jo Rishta Reel ki ranking me use hota hai, aapki profile par abhi laga kar.",
        )}
      </p>

      <div className="mt-4 space-y-3.5">
        <Progress value={base} label={t("boost.scoreCompare.withoutBoost", "Bina boost")} />
        <Progress value={boosted} label={t("boost.scoreCompare.withBoost", "Boost ke saath")} variant="trust" />
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[0.75rem] leading-snug text-subtle">
        <Info className="mt-px size-3.5 shrink-0" />
        {t("boost.scoreCompare.footnotePre", "Ye score final ranking ka sirf ")}
        {weightPct}
        {t(
          "boost.scoreCompare.footnotePost",
          "% hissa hai — profile ki quality aur match-fit hamesha zyada matter karte hain. Boost kisi bhi surat me unhe overtake nahi karta.",
        )}
      </p>
    </div>
  );
}
