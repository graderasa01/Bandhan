import { Check, Minus } from "lucide-react";
import {
  PLAN_COMPARISON_ROWS,
  type ComparisonValue,
  type PlanFeatureSet,
} from "@/lib/constants/plans";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";

export type ComparisonPlan = {
  code: string;
  name: string;
  /** Price display, e.g. "₹999". */
  price: string;
  /** The plan's resolved capability set — the catalog has already merged admin edits into it. */
  features: PlanFeatureSet;
};

type Props = {
  /**
   * The plans to compare, left to right. Passed in rather than derived from a
   * constant: an admin can create plans, so there is no fixed column list any
   * more, and every cell is computed from the plan's own resolved features so
   * it can never contradict the plan card beside it.
   */
  plans: ComparisonPlan[];
  recommendedCode?: string;
};

/**
 * Dictionary key for each comparison row, looked up by the row's own Hinglish
 * label. The rows themselves live in lib/constants/plans.ts, which has no key
 * field to hang this off — a label with no entry here simply stays Hinglish.
 */
const ROW_KEYS: Record<string, string> = {
  "Rishta Reel / din": "subscription.rowReelPerDay",
  "AI se poocho": "subscription.rowAskAi",
  "Photo bina match ke dekhein": "subscription.rowPhotoUnlock",
  "Kisne shortlist kiya — naam": "subscription.rowAdmirerIdentity",
  "Kisne profile dekhi — naam": "subscription.rowViewerIdentity",
  "Aayi hui Voice Note kholna": "subscription.rowVoiceUnlock",
  "Turant Kundli Banayen (manual entry)": "subscription.rowKundliManual",
  "Kundli PDF download aur share": "subscription.rowKundliPdf",
  "Grio se ek rishtey par baat": "subscription.rowMatchExplain",
  "Grio kitni baatein yaad rakhega": "subscription.rowGrioMemory",
  "Grio se bol kar baat": "subscription.rowGrioVoice",
  "Incognito — bina dikhe dekhein": "subscription.rowIncognito",
};

function Value({ value, t }: { value: ComparisonValue; t: Translate }) {
  if (value === true) {
    return (
      <>
        <Check className="mx-auto size-4 text-trust" aria-hidden />
        <span className="sr-only">{t("subscription.included", "Milta hai")}</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus className="mx-auto size-4 text-subtle" aria-hidden />
        <span className="sr-only">{t("subscription.notIncluded", "Nahi milta")}</span>
      </>
    );
  }
  if (value === "Saare 13") {
    return <span className="text-[0.875rem] text-ink">{t("subscription.rowDeepProfileAll", "Saare 13")}</span>;
  }
  const memoryMatch = /^(\d+) baatein$/.exec(value);
  if (memoryMatch) {
    return (
      <span className="text-[0.875rem] text-ink">
        {memoryMatch[1]} {t("subscription.rowGrioMemoryUnit", "baatein")}
      </span>
    );
  }
  return <span className="text-[0.875rem] text-ink">{value}</span>;
}

/**
 * D-11's capability ladder, full width. On phones the table scrolls
 * horizontally inside its own container rather than squeezing 5 columns into
 * 320px — the plan-name column stays pinned so a row never loses its label.
 */
export default async function PlanComparisonTable({ plans, recommendedCode = "STANDARD" }: Props) {
  const t = await getT();
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <caption className="sr-only">
          {t("subscription.compareCaption", "Plans ki tulna — har plan me kya milta hai")}
        </caption>
        <thead>
          <tr className="border-b border-line bg-bg-subtle">
            <th scope="col" className="sticky left-0 z-10 bg-bg-subtle px-4 py-4 text-[0.8125rem] font-semibold text-muted">
              {t("subscription.planComparisonTable.feature", "Feature")}
            </th>
            {plans.map((plan) => (
              <th
                key={plan.code}
                scope="col"
                className={cn(
                  "px-4 py-4 text-center",
                  plan.code === recommendedCode && "bg-gold-50 dark:bg-gold-900/25",
                )}
              >
                <span className="block text-[0.9375rem] font-semibold text-ink">{plan.name}</span>
                <span className="mt-0.5 block text-[0.75rem] text-muted">{plan.price}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_COMPARISON_ROWS.map((row, i) => (
            <tr key={row.label} className={cn("border-b border-line last:border-0", i % 2 === 1 && "bg-surface-2/50")}>
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-10 px-4 py-3 text-[0.875rem] font-normal text-muted",
                  i % 2 === 1 ? "bg-surface-2" : "bg-surface",
                )}
              >
                {ROW_KEYS[row.label] ? t(ROW_KEYS[row.label], row.label) : row.label}
              </th>
              {plans.map((plan) => (
                <td
                  key={plan.code}
                  className={cn(
                    "px-4 py-3 text-center",
                    plan.code === recommendedCode && "bg-gold-50/60 dark:bg-gold-900/15",
                  )}
                >
                  <Value value={row.pick(plan.features)} t={t} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
