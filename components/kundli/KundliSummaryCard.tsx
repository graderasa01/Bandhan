import Link from "next/link";
import { ArrowRight, Flame, Info, Moon, Sunrise } from "lucide-react";
import Card from "@/components/ui/Card";
import KundliChartSvg from "@/components/kundli/KundliChartSvg";
import { kundliFieldCtaLabel, kundliFieldEditHref, type KundliMissingField } from "@/components/kundli/kundliLinks";
import { mangalSummary } from "@/lib/services/kundli/mangalSummary";
import type { KundliChart } from "@/lib/contracts/kundli";
import type { Translate } from "@/lib/i18n/translate";

/**
 * The kundli at a glance — the five things a family asks first, in the order
 * they ask them: Chandra rashi, nakshatra, lagna, Mangal, the chart. Nothing
 * on this card needs scrolling; everything longer lives in `KundliDetails`.
 *
 * It is a server component on purpose: it takes the page's `t` and the chart
 * and renders once. Only `KundliChartSvg` is a client island.
 *
 * Honesty rules baked into the layout rather than into a disclaimer:
 *
 *  - **The lagna row never shows a guessed lagna.** Without time + place it
 *    shows one sentence and the targeted deck link — never the full journey.
 *  - **The chart without a lagna is a Chandra Kundli**, labelled as one. The
 *    Moon's rashi is the one thing the date alone pins, and a Moon chart is a
 *    real traditional chart — not a lagna chart with noon quietly substituted.
 *  - **Mangal is one line with its own limit attached.** From the Moon alone
 *    it is "aadha jawab", and the line says so where the status is, not in a
 *    footnote.
 *  - **One limitation line is always visible**, phrased per precision rung,
 *    and always ends the same way: jaankari hai, faisla nahi.
 */
export default function KundliSummaryCard({ chart, t }: { chart: KundliChart; t: Translate }) {
  const missing: KundliMissingField | null =
    chart.precision === "no-time" ? "birthTime" : chart.precision === "no-place" ? "birthPlace" : null;
  const chartLagna = chart.lagna?.rashi ?? chart.chandra.rashi;

  return (
    <Card variant="luxe" padding="md">
      {/* Chandra first: the one thing every rung states exactly enough, and
          the one thing guna milan runs on. */}
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Moon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-medium uppercase tracking-wider text-subtle">
            {t("userPage.kundli.chandraRashi", "Chandra Rashi")}
          </p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-wine-700">
            {chart.chandra.rashiName}
          </p>
          <p className="mt-1 text-base text-ink">
            <span className="font-semibold">{chart.chandra.nakshatraName}</span>
            <span className="text-muted">
              {" "}
              · {t("userPage.kundli.charanWord", "charan")} {chart.chandra.pada} ·{" "}
              {t("userPage.kundli.swamiWord", "swami")} {chart.chandra.nakshatraLord}
            </span>
          </p>
        </div>
      </div>

      <dl className="mt-4 divide-y divide-line/70 border-y border-line/70">
        {/* Lagna */}
        <div className="flex items-start gap-3 py-3">
          <Sunrise className="mt-0.5 size-4 shrink-0 text-gold-700 dark:text-gold-300" />
          <dt className="w-16 shrink-0 text-[0.875rem] font-semibold text-ink">
            {t("userPage.kundli.lagnaLabel", "Lagna")}
          </dt>
          <dd className="min-w-0 flex-1">
            {chart.lagna ? (
              <p className="text-[0.875rem] text-ink">
                <span className="font-semibold">{chart.lagna.rashiName}</span>{" "}
                <span className="text-muted">
                  {chart.lagna.degreeInRashi.toFixed(0)}°{chart.placeName ? ` · ${chart.placeName}` : ""}
                </span>
              </p>
            ) : (
              <>
                <p className="text-[0.875rem] leading-snug text-muted">
                  {chart.precision === "no-place"
                    ? t(
                        "userPage.kundli.lagnaNeedsPlace",
                        "Lagna ke liye janm-sthaan chahiye — jo shehar likha hai wo list me nahi mila.",
                      )
                    : t("userPage.kundli.lagnaNeedsTimePlace", "Lagna ke liye janm samay aur sthaan chahiye.")}
                </p>
                {missing && (
                  <Link
                    href={kundliFieldEditHref(missing)}
                    className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-[0.875rem] font-semibold text-wine-700 hover:text-wine-800"
                  >
                    {kundliFieldCtaLabel(missing)}
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </>
            )}
          </dd>
        </div>

        {/* Mangal — status and its limit in the same breath. */}
        <div className="flex items-start gap-3 py-3">
          <Flame className="mt-0.5 size-4 shrink-0 text-gold-700 dark:text-gold-300" />
          <dt className="w-16 shrink-0 text-[0.875rem] font-semibold text-ink">
            {t("userPage.kundli.mangalLabel", "Mangal")}
          </dt>
          <dd className="min-w-0 flex-1 text-[0.875rem] leading-snug text-muted">
            <MangalLine chart={chart} t={t} />
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex justify-center">
        <KundliChartSvg lagnaRashi={chartLagna} grahas={chart.grahas} />
      </div>
      <p className="mt-2 text-center text-[0.875rem] text-subtle">
        {chart.lagna
          ? t("userPage.kundli.chartCaptionLagna", "Janm Kundli · Uttar Bharatiya shaili · ghar ke andar ka number rashi hai")
          : t("userPage.kundli.chartCaptionChandra", "Chandra Kundli · Chandra pehle ghar me — Lagna abhi nahi bana")}
      </p>

      <p className="mt-4 flex items-start gap-2 rounded-md bg-bg-subtle px-3 py-2.5 text-[0.875rem] leading-snug text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-subtle" />
        <span>
          {chart.precision === "full"
            ? t(
                "userPage.kundli.limitFull",
                "Janm samay aur sthaan dono se bani hai — phir bhi ye jaankari hai, faisla nahi.",
              )
            : chart.precision === "no-place"
              ? t(
                  "userPage.kundli.limitNoPlace",
                  "Janm sthaan ke bina Lagna aur grah-bhava nahi bante — ye jaankari hai, faisla nahi.",
                )
              : t(
                  "userPage.kundli.limitNoTime",
                  "Janm samay ke bina Lagna aur grah-bhava approximate hain — ye jaankari hai, faisla nahi.",
                )}
        </span>
      </p>
    </Card>
  );
}

/** The words are `mangalSummary`'s — shared with the native app's Meri Kundli. */
function MangalLine({ chart, t }: { chart: KundliChart; t: Translate }) {
  const { status, detail } = mangalSummary(chart, t);
  return (
    <>
      <span className="font-semibold text-ink">{status}</span>
      {" — "}
      {detail}
    </>
  );
}
