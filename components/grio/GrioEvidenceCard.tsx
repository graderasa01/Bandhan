"use client";

import { ArrowLeftRight, Check, CircleDashed, HelpCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrioEvidenceCard as Card, GrioEvidenceRow } from "@/lib/contracts/grioProfile";

/**
 * What was compared, shown beside what Grio said about it.
 *
 * The prose above this card is a model's phrasing; the rows here are code's
 * comparison (lib/services/grio/profile/evidence.ts) — the ranking's own
 * comparators, restated with both sides visible. So "Location aligns" arrives
 * with "Aapki pasand: Delhi · Profile: Delhi" underneath it, and a member can
 * check the claim with their own eyes instead of taking a sentence on trust.
 *
 * Three groups and never a percentage: what matches, what differs, and what
 * nobody has said yet. The last one is not a mark against anyone — it is the
 * list of things worth asking.
 */

const ROW_ICON: Record<GrioEvidenceRow["status"], { Icon: typeof Check; className: string; label: string }> = {
  match: { Icon: Check, className: "text-trust", label: "Milta hai" },
  partial: { Icon: CircleDashed, className: "text-warn", label: "Thoda alag" },
  different: { Icon: ArrowLeftRight, className: "text-warn", label: "Alag hai" },
  unknown: { Icon: HelpCircle, className: "text-muted", label: "Pata nahi" },
  locked: { Icon: Lock, className: "text-muted", label: "Baad me khulega" },
};

export default function GrioEvidenceCard({ card }: { card: Card }) {
  return (
    <div className="w-full max-w-[85%] rounded-lg border border-line bg-surface px-3.5 py-3">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">{card.title}</p>
      {card.groups.map((group) => (
        <div key={group.status} className="mt-2.5">
          <p className="text-[0.75rem] font-semibold text-ink">{group.label}</p>
          <ul className="mt-1 space-y-1.5">
            {group.rows.map((row) => {
              const { Icon, className, label } = ROW_ICON[row.status];
              const sides = [row.yours, row.theirs ? `Profile: ${row.theirs}` : null].filter(Boolean).join(" · ");
              return (
                <li key={row.key} className="flex items-start gap-2">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", className)} aria-label={label} />
                  <span className="min-w-0 text-[0.8125rem] leading-snug text-ink">
                    <span className="font-medium">{row.label}</span>
                    {sides && <span className="block text-[0.75rem] text-muted">{sides}</span>}
                    {row.note && <span className="block text-[0.75rem] text-subtle">{row.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {card.footnote && <p className="mt-2.5 text-[0.6875rem] leading-snug text-subtle">{card.footnote}</p>}
    </div>
  );
}
