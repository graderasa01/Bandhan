import Link from "next/link";
import { ArrowRight, CalendarClock, Sparkles, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import { kundliFieldEditHref } from "@/components/kundli/kundliLinks";
import type { MatchMilanRow } from "@/lib/services/kundli/kundliMatch";
import type { Translate } from "@/lib/i18n/translate";

/**
 * Guna milan with the people the user has already matched with — one row per
 * person, one number per row, and no number at all where the jaankari is not
 * there to compute one.
 *
 * The tone chips reuse the classical band names (`GUNA_BANDS`) as they are;
 * this list never re-scores or re-labels what `computeGunaMilan` said.
 */
const TONE_CHIP: Record<string, string> = {
  Uttam: "border-trust/30 bg-trust-bg text-trust",
  Shubh: "border-trust/30 bg-trust-bg text-trust",
  Madhyam: "border-info/30 bg-info-bg text-info",
  "Vichaar yogya": "border-warn/35 bg-warn-bg text-warn",
};

export default function KundliMilanList({
  rows,
  viewerNeedsBirthTime,
  t,
}: {
  rows: MatchMilanRow[];
  /** True when the viewer's own birth time is missing — the "assumed time" note then gets a one-tap fix. */
  viewerNeedsBirthTime: boolean;
  t: Translate;
}) {
  const anyAssumed = rows.some((r) => r.assumedTime);

  return (
    <Card variant="default" padding="md">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">
            {t("userPage.kundli.milanTitle", "Aapke matches ke saath milan")}
          </h2>
          <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">
            {t("userPage.kundli.milanNoteShort", "Sirf un logon ke saath jinse match ho chuka hai — ye jaankari hai, faisla nahi.")}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-md bg-bg-subtle px-4 py-4 sm:flex-row sm:items-center">
          <Users className="size-5 shrink-0 text-subtle" />
          <p className="min-w-0 flex-1 text-[0.875rem] leading-snug text-muted">
            {t("userPage.kundli.milanEmpty", "Abhi koi match nahi — match hote hi uska guna milan yahan aa jaayega.")}
          </p>
          <Link
            href="/user/matches"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[0.875rem] font-semibold text-wine-700 hover:border-gold-300"
          >
            See Matches
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rows.map((row) => (
            <li key={row.profileId}>
              <Link
                href={`/user/profile/${row.profileId}`}
                className="flex min-h-12 items-center gap-3 py-2.5 transition-colors hover:text-wine-700"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-ink">{row.name}</span>
                  {row.blocked === "missing-data" ? (
                    <span className="block text-[0.875rem] leading-snug text-subtle">
                      {t("userPage.kundli.milanMissingData", "Milan ke liye janm-jaankari poori nahi hai — score nahi banaya.")}
                    </span>
                  ) : row.assumedTime ? (
                    <span className="flex items-center gap-1 text-[0.875rem] leading-snug text-subtle">
                      <CalendarClock className="size-3.5 shrink-0" />
                      {t("userPage.kundli.milanAssumedTime", "Birth time ke bina — dopahar maan kar")}
                    </span>
                  ) : null}
                </span>
                {row.hasDosha && (
                  <span className="shrink-0 text-[0.875rem] font-medium text-warn">
                    {t("userPage.kundli.doshChip", "dosh")}
                  </span>
                )}
                {row.total !== null && row.band !== null ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[0.875rem] font-semibold text-ink">{row.total}/36</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[0.875rem] font-semibold ${
                        TONE_CHIP[row.band] ?? "border-line bg-bg-subtle text-muted"
                      }`}
                    >
                      {row.band}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-[0.875rem] font-medium text-muted">
                    —/36
                  </span>
                )}
                <ArrowRight className="size-4 shrink-0 text-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {anyAssumed && viewerNeedsBirthTime && (
        <Link
          href={kundliFieldEditHref("birthTime")}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[0.875rem] font-semibold text-wine-700 hover:text-wine-800"
        >
          Add Birth Time
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </Card>
  );
}
