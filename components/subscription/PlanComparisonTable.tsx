import { Check, Minus } from "lucide-react";
import {
  PLAN_COMPARISON_ROWS,
  PLAN_NAMES,
  PLAN_ORDER,
  REEL_PER_DAY_ROW_LABEL,
  type ComparisonValue,
} from "@/lib/constants/plans";
import { cn } from "@/lib/utils";

type Props = {
  /** Price display per plan code, e.g. { FREE: "₹0", BASIC: "₹999" }. */
  prices: Record<string, string>;
  recommendedCode?: string;
  /**
   * Live reel counts per plan (`getPlanReelLimits()`), for the one row an
   * admin can retune. Omit and the table falls back to D-11's ladder
   * defaults. This table's own heading promises "koi hidden limit nahi", and
   * it renders directly beside plan cards that already quote the live number
   * — a stale row here would contradict the card next to it.
   */
  reelPerDay?: Record<string, number>;
};

function Value({ value }: { value: ComparisonValue }) {
  if (value === true) {
    return (
      <>
        <Check className="mx-auto size-4 text-trust" aria-hidden />
        <span className="sr-only">Milta hai</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus className="mx-auto size-4 text-subtle" aria-hidden />
        <span className="sr-only">Nahi milta</span>
      </>
    );
  }
  return <span className="text-[0.875rem] text-ink">{value}</span>;
}

/**
 * D-11's capability ladder, full width. On phones the table scrolls
 * horizontally inside its own container rather than squeezing 5 columns into
 * 320px — the plan-name column stays pinned so a row never loses its label.
 */
export default function PlanComparisonTable({ prices, recommendedCode = "STANDARD", reelPerDay }: Props) {
  const rows = reelPerDay
    ? PLAN_COMPARISON_ROWS.map((row) =>
        row.label === REEL_PER_DAY_ROW_LABEL
          ? {
              ...row,
              values: Object.fromEntries(
                PLAN_ORDER.map((code) => [code, String(reelPerDay[code] ?? row.values[code])]),
              ) as typeof row.values,
            }
          : row,
      )
    : PLAN_COMPARISON_ROWS;


  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <caption className="sr-only">Plans ki tulna — har plan me kya milta hai</caption>
        <thead>
          <tr className="border-b border-line bg-bg-subtle">
            <th scope="col" className="sticky left-0 z-10 bg-bg-subtle px-4 py-4 text-[0.8125rem] font-semibold text-muted">
              Feature
            </th>
            {PLAN_ORDER.map((code) => (
              <th
                key={code}
                scope="col"
                className={cn(
                  "px-4 py-4 text-center",
                  code === recommendedCode && "bg-gold-50 dark:bg-gold-900/25",
                )}
              >
                <span className="block text-[0.9375rem] font-semibold text-ink">{PLAN_NAMES[code]}</span>
                <span className="mt-0.5 block text-[0.75rem] text-muted">{prices[code] ?? "—"}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.label} className={cn("border-b border-line last:border-0", i % 2 === 1 && "bg-surface-2/50")}>
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-10 px-4 py-3 text-[0.875rem] font-normal text-muted",
                  i % 2 === 1 ? "bg-surface-2" : "bg-surface",
                )}
              >
                {row.label}
              </th>
              {PLAN_ORDER.map((code) => (
                <td
                  key={code}
                  className={cn(
                    "px-4 py-3 text-center",
                    code === recommendedCode && "bg-gold-50/60 dark:bg-gold-900/15",
                  )}
                >
                  <Value value={row.values[code]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
