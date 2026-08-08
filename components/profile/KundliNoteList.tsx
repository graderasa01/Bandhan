import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KundliNote, KundliTone } from "@/lib/services/kundli/kundliService";

const TONE: Record<KundliTone, { wrap: string; icon: typeof Info }> = {
  ok: { wrap: "border-trust/25 bg-trust-bg text-trust", icon: CheckCircle2 },
  info: { wrap: "border-info/25 bg-info-bg text-info", icon: Info },
  caution: { wrap: "border-warn/30 bg-warn-bg text-warn", icon: AlertTriangle },
};

/**
 * Gotra/manglik notes, rendered as information rather than a verdict — every
 * string ends with the decision belonging to the family, never to the app. The
 * list is empty far more often than not, and that is correct: silence beats
 * "sab theek hai" filler, which would make the real cautions invisible.
 */
export default function KundliNoteList({ notes, className }: { notes: KundliNote[]; className?: string }) {
  if (notes.length === 0) return null;

  return (
    <div className={cn("mt-3 md:mt-2", className)}>
      <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
        Parampara ke hisaab se
      </p>
      <ul className="space-y-1.5">
        {notes.map((note) => {
          const tone = TONE[note.tone];
          const Icon = tone.icon;
          return (
            <li
              key={note.id}
              className={cn("flex items-start gap-2 rounded-md border px-3 py-2 md:py-1.5", tone.wrap)}
            >
              <Icon className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-semibold">{note.title}</span>
                <span className="block text-[0.8125rem] leading-snug text-muted">{note.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
