import { BadgeCheck, CircleAlert, CircleDashed, Clock } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import type { VerificationBadge } from "@/lib/services/verification/verificationBadgeService";

/**
 * Badges, with the two things a badge is useless without: what was checked, and
 * when.
 *
 * ## Why the limit is on the card and not in a tooltip
 *
 * This list is read by somebody deciding whether to trust a stranger they are
 * considering marrying. "Pehchaan checked" alone is read as an endorsement of
 * the person — which is the one claim this product must never make. So the
 * scope sentence sits under every badge, and the `notMeaning` line sits under
 * every badge that actually passed, because that is where the over-reading
 * happens. Nobody over-reads a grey "not checked".
 *
 * ## Why an expired badge is still shown
 *
 * "Verified last year, needs refreshing" is a truer thing to show than nothing,
 * and hiding it would quietly turn a lapse into a state that looks identical to
 * never having been checked. It is shown, in neutral tone, asserting nothing.
 */
function fmt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const TONE_CLASS = {
  good: "text-trust",
  warn: "text-warn",
  neutral: "text-muted",
} as const;

export default async function VerificationBadgeList({
  badges,
  /** Hide the ones that were never checked — right for a profile, wrong for the owner's own screen. */
  liveOnly = false,
}: {
  badges: VerificationBadge[];
  liveOnly?: boolean;
}) {
  const t = await getT();
  const rows = liveOnly ? badges.filter((b) => b.state !== "NOT_CHECKED") : badges;

  if (rows.length === 0) {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-muted">
        {t("verification.badgeList.empty", "Abhi koi check nahi hua hai.")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((b) => {
        const at = fmt(b.checkedAt);
        const till = fmt(b.expiresAt);
        const Icon =
          b.state === "MATCHED"
            ? BadgeCheck
            : b.state === "MISMATCH"
              ? CircleAlert
              : b.state === "EXPIRED"
                ? Clock
                : CircleDashed;

        return (
          <li key={b.kind} className="rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Icon className={`size-4 shrink-0 ${TONE_CLASS[b.tone]}`} aria-hidden />
              <span className="text-[0.875rem] font-semibold text-ink">{b.label}</span>
              <span className={`text-[0.75rem] ${TONE_CLASS[b.tone]}`}>{b.stateLine}</span>
              {at && <span className="ml-auto text-[0.75rem] text-muted">{at}</span>}
            </div>

            <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{b.scope}</p>

            {b.state === "MATCHED" && (
              <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{b.notMeaning}</p>
            )}

            {b.state === "EXPIRED" && till && (
              <p className="mt-1 text-[0.75rem] text-muted">
                {till} {t("verification.badgeList.expiredSuffix", "ko purana ho gaya.")}
              </p>
            )}

            {b.resultNote && (
              <p className="mt-1.5 rounded border border-line/70 bg-surface px-2.5 py-1.5 text-[0.75rem] leading-relaxed text-ink">
                {b.resultNote}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
