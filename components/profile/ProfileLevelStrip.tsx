import { Lock } from "lucide-react";
import type { ProfileLockedHint } from "@/lib/contracts/profileView";

/**
 * What the next level opens, stated as fact.
 *
 * It names the actual fields rather than counting them, because "12 aur
 * details locked hain" is a number nobody can check — and half the time the
 * person simply hasn't filled twelve fields. Naming them keeps the promise
 * checkable: match ho jaye, aur ginti kar lo.
 */
export default function ProfileLevelStrip({ hint }: { hint: ProfileLockedHint }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3.5">
      <span className="mt-px grid size-8 shrink-0 place-items-center rounded-full bg-bg-subtle text-muted">
        <Lock className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.875rem] font-semibold text-ink">{hint.title}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">{hint.description}</p>
      </div>
    </div>
  );
}
