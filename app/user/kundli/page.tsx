import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock, ChevronDown, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getMatchMilanList, getOwnChart } from "@/lib/services/kundli/kundliMatch";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import KundliSummaryCard from "@/components/kundli/KundliSummaryCard";
import KundliDetails from "@/components/kundli/KundliDetails";
import KundliMilanList from "@/components/kundli/KundliMilanList";
import KundliExportCard from "@/components/kundli/KundliExportCard";
import ManualKundliCard from "@/components/kundli/ManualKundliCard";
import { kundliFieldEditHref } from "@/components/kundli/kundliLinks";

/**
 * "Meri Kundli" — the user's own chart, and guna milan against the people they
 * have already matched with.
 *
 * Reading order, top to bottom: the summary card (rashi, nakshatra, lagna,
 * Mangal, chart — the whole answer in one screen), then the milan list, then
 * the PDF, then everything longer behind "Details", then the paid manual tool
 * for somebody else's birth date.
 *
 * The page is still built around its own failure modes, because most users
 * hit one. Date of birth is required at signup, but birth *time* and birth
 * *place* are optional stage-3 fields, and a kundli that silently invented
 * them would be the single most convincing wrong thing in the app. Each rung
 * of `chart.precision` keeps its own honest state — and every fix is a
 * **targeted** deck (`kundliLinks.ts`) that asks for only the missing field
 * and comes straight back here, never the full profile journey.
 */
export const dynamic = "force-dynamic";

export default async function KundliPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/kundli");

  const t = await getT();
  const [chart, milanRows, planCtx] = await Promise.all([
    getOwnChart(user.id),
    getMatchMilanList(user.id, t),
    getPlanContext(user.id),
  ]);
  const manualUsable = planCtx.features.kundliManualEntry || planCtx.credits.KUNDLI_UNLOCK > 0;

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700">
            {t("userPage.kundli.title", "Meri Kundli")}
          </h1>
          <p className="mt-1.5 text-base text-muted">
            {t("userPage.kundli.subtitleShort", "Asli graha-sthiti se bani aapki kundli, aur matches ke saath guna milan.")}
          </p>
        </header>

        {!chart ? (
          <Card variant="soft" padding="lg">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
                <CalendarClock className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">
                  {t("userPage.kundli.needDobTitle", "Kundli ke liye pehle Date of Birth chahiye")}
                </h2>
                <p className="mt-1 text-[0.875rem] leading-snug text-muted">
                  {t("userPage.kundli.needDobBody", "Bas date daal dijiye — baaki sab hum khud nikaal lete hain.")}
                </p>
              </div>
            </div>
            <Link
              href={kundliFieldEditHref("dateOfBirth")}
              className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold"
            >
              Add Date of Birth
              <ArrowRight className="size-4" />
            </Link>
          </Card>
        ) : (
          <>
            <KundliSummaryCard chart={chart} t={t} />

            <KundliMilanList rows={milanRows} viewerNeedsBirthTime={!chart.hasBirthTime} t={t} />

            {/* After the chart and the milan, because it exports exactly
                those — offering the file before the reader has seen what is
                in it would be the wrong order. */}
            <KundliExportCard entitled={planCtx.features.kundliPdfExport} />

            <KundliDetails chart={chart} t={t} />
          </>
        )}

        {/* Independent of the section above: works whether or not this user
            has ever filled DOB in their own profile, and isn't limited to
            "your own" birth details either. Collapsed by default so the
            screen stays about *this* user's kundli. */}
        <details className="group rounded-lg border border-line bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-5 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
              <Sparkles className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-ink">
                {t("userPage.kundli.manualToggle", "Turant Kundli Banayen")}
              </span>
              <span className="block text-[0.875rem] leading-snug text-muted">
                {t("userPage.kundli.manualToggleHint", "Kisi bhi Date of Birth se — profile bharne ki zaroorat nahi.")}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-line p-3">
            <ManualKundliCard
              usable={manualUsable}
              usingCreditOnly={!planCtx.features.kundliManualEntry && manualUsable}
              creditsRemaining={planCtx.credits.KUNDLI_UNLOCK}
              pdfEntitled={planCtx.features.kundliPdfExport && planCtx.features.kundliManualEntry}
            />
          </div>
        </details>
      </div>
    </UserShell>
  );
}
