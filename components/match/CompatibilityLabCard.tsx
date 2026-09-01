import { CircleHelp, MessageCircleWarning, Scale, Sparkles, type LucideIcon } from "lucide-react";
import Card from "@/components/ui/Card";
import type {
  AlignmentStatus,
  CompatibilityDimension,
  CompatibilityReport,
} from "@/lib/services/match/compatibilityLab";

/**
 * You + them, in four buckets instead of one percentage.
 *
 * ## Why this sits next to the score rather than replacing it
 *
 * `MatchFitCard` shows the ranking's own numbers, and those are real — they are
 * what decided the ordering. What a number cannot carry is the difference
 * between a 60 that means "you clash on children" and a 60 that means "neither
 * of you has answered". Both drag a percentage down identically; only one is a
 * reason to hesitate. So the score stays and this goes above it.
 *
 * ## Ordering
 *
 * Discuss first, then unknowns, then the manageable differences, then what
 * aligns — which is the opposite of how a marketing surface would order it. The
 * pleasant half is the half a user will find on their own; the honest sentence
 * about what does not line up is the thing this feature exists to say, and
 * burying it under four green rows is how a compatibility report becomes
 * decoration.
 *
 * ## Privacy
 *
 * Every sentence here is `dimension.detail`, built by `describe()` in
 * `compatibilityLab.ts`, which is the single place that decides whether a
 * candidate's answer may be named. This component never composes its own copy
 * from an answer — so there is exactly one function to audit, not two.
 */

const BUCKET: {
  status: AlignmentStatus;
  title: string;
  note?: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    status: "DISCUSS",
    title: "Ye baat kar lena behtar hai",
    icon: MessageCircleWarning,
    tone: "text-wine-700 dark:text-wine-300",
  },
  {
    status: "UNKNOWN",
    title: "Ye abhi pata hi nahi",
    // Said out loud, because an unanswered question sitting in a compatibility
    // report reads as a failing unless something says otherwise.
    note: "Ye kami nahi hai — bas kisi ne abhi jawab nahi diya.",
    icon: CircleHelp,
    tone: "text-muted",
  },
  {
    status: "DIFFERENT_BUT_MANAGEABLE",
    title: "Alag hai, par takraav nahi",
    icon: Scale,
    tone: "text-ink",
  },
  {
    status: "STRONG_ALIGNMENT",
    title: "Ye achha mel khaata hai",
    icon: Sparkles,
    tone: "text-gold-700 dark:text-gold-300",
  },
];

/** Beyond this a card becomes a spreadsheet. The rest live in the Grio answer. */
const MAX_PER_BUCKET = 3;

function Row({ dimension }: { dimension: CompatibilityDimension }) {
  return (
    <li className="text-[0.8125rem] leading-relaxed">
      <span className="font-medium text-ink">{dimension.label}</span>
      <span className="text-muted"> — {dimension.detail}</span>
    </li>
  );
}

export default function CompatibilityLabCard({
  report,
  otherName,
  action,
}: {
  report: CompatibilityReport;
  otherName: string;
  /** Usually the "Ask Grio" button, so the card ends in a way forward. */
  action?: React.ReactNode;
}) {
  const buckets = BUCKET.map((b) => ({
    ...b,
    rows: report.dimensions.filter((d) => d.status === b.status),
  })).filter((b) => b.rows.length > 0);

  // Nothing to compare at all — neither side has answered anything. The page
  // renders no card rather than an empty heading that implies a verdict.
  if (buckets.length === 0) return null;

  return (
    <Card className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold text-ink">Aap aur {otherName}</h3>
        <p className="shrink-0 text-[0.6875rem] text-muted">
          {report.coverage.total} me se {report.coverage.known} baaton par tulna ho paayi
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-3.5">
        {buckets.map((b) => {
          const Icon = b.icon;
          const extra = b.rows.length - MAX_PER_BUCKET;
          return (
            <section key={b.status}>
              <p className={`flex items-center gap-1.5 text-[0.75rem] font-semibold ${b.tone}`}>
                <Icon className="size-3.5" />
                {b.title}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {b.rows.slice(0, MAX_PER_BUCKET).map((d) => (
                  <Row key={d.key} dimension={d} />
                ))}
              </ul>
              {extra > 0 && <p className="mt-1 text-[0.6875rem] text-muted">…aur {extra} aur.</p>}
              {b.note && <p className="mt-1 text-[0.6875rem] text-muted">{b.note}</p>}
            </section>
          );
        })}
      </div>

      {/* Stated once, at the bottom, in the same words the prompt uses. A
          comparison that looks like a verdict is the failure mode this whole
          layer was built to avoid. */}
      <p className="mt-3.5 border-t border-line pt-2.5 text-[0.6875rem] leading-relaxed text-muted">
        Ye tulna code ne ki hai, kisi AI ne nahi — aur ye faisla nahi hai. Faisla aapka apna rahega.
      </p>

      {action && <div className="mt-3">{action}</div>}
    </Card>
  );
}
