import { ArrowDownRight, Handshake, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import type { EarningsStatement } from "@/lib/services/payouts/earningsStatement";

/**
 * The line-by-line answer to "where did my balance come from".
 *
 * ## Why a recovery is a line and not a footnote
 *
 * When a refund takes back money a partner has already been paid, the polite
 * thing to do is bury it. The honest thing is to give it a row with a date, an
 * amount and the sentence explaining it, in the same list as the earnings — so
 * that a partner adding the column up gets the number the payouts screen shows,
 * and so that nobody has to ask support why their balance moved.
 */
function rupees(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  return `${sign}₹${Math.abs(Math.round(paise / 100)).toLocaleString("en-IN")}`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function EarningsStatementCard({ statement }: { statement: EarningsStatement }) {
  if (statement.lines.length === 0) return null;

  return (
    <Card variant="default" padding="lg" className="mt-4">
      <h2 className="text-base font-semibold text-wine-700">Hisaab</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
        Har line wo hai jisse aapki kamai badhi ya ghati. Upar ke tile isi ka jod hain.
      </p>

      {statement.heldPaise > 0 && (
        <p className="mt-2 rounded-md border border-line/70 bg-surface-2 px-3 py-2 text-[0.75rem] leading-relaxed text-muted">
          {rupees(statement.heldPaise)} abhi rukа hua hai — booking poori hone aur refund window khatam hone
          ke baad hi withdraw ho sakta hai. Ye aapke available balance me nahi juda hai.
        </p>
      )}

      <ul className="mt-3 flex flex-col divide-y divide-line">
        {statement.lines.map((l) => (
          <li key={`${l.kind}-${l.id}`} className="flex flex-wrap items-start gap-2 py-2.5">
            {l.kind === "SERVICE" ? (
              <Handshake className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            ) : l.kind === "REFERRAL" ? (
              <Users className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            ) : (
              <ArrowDownRight className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            )}

            <div className="min-w-0 flex-1">
              <p className="text-[0.8125rem] leading-relaxed text-ink">{l.label}</p>
              <p className="mt-0.5 text-[0.75rem] text-muted">
                {fmt(l.at)} · {l.statusLabel}
                {l.kind === "SERVICE" && l.grossPaise > 0 && (
                  <>
                    {" · "}
                    {rupees(l.grossPaise)} me se platform fee {rupees(l.platformFeePaise)}
                  </>
                )}
              </p>
            </div>

            <span
              className={`shrink-0 text-[0.8125rem] font-semibold ${
                l.netPaise < 0 ? "text-warn" : l.netPaise === 0 ? "text-muted" : "text-ink"
              }`}
            >
              {rupees(l.netPaise)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
