import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock, Info, MapPin, Moon, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getMatchMilanList, getOwnChart } from "@/lib/services/kundli/kundliMatch";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { BHAVA_MEANING, BHAVA_ORDINAL } from "@/lib/services/kundli/chart";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import KundliChartSvg from "@/components/kundli/KundliChartSvg";
import KundliExportCard from "@/components/kundli/KundliExportCard";
import ManualKundliCard from "@/components/kundli/ManualKundliCard";

/**
 * "Meri Kundli" — the user's own chart, and guna milan against the people they
 * have already matched with.
 *
 * The page is built around its own failure modes, because most users will hit
 * one of them. Date of birth is required at signup, but birth *time* and birth
 * *place* are optional fields deep in stage 3 of the profile builder, and a
 * kundli screen that silently invented them would be the single most
 * convincing wrong thing in the app. So each rung of `chart.precision` gets its
 * own honest state and its own one-tap fix, instead of one generic empty page.
 */
export const dynamic = "force-dynamic";

const TONE_CHIP: Record<string, string> = {
  Uttam: "border-trust/30 bg-trust-bg text-trust",
  Shubh: "border-trust/30 bg-trust-bg text-trust",
  Madhyam: "border-info/30 bg-info-bg text-info",
  "Vichaar yogya": "border-warn/35 bg-warn-bg text-warn",
};

function bhavaOrdinal(house: number, t: Translate): string {
  return t(`userPage.kundli.bhavaOrdinal${house}`, BHAVA_ORDINAL[house - 1]);
}

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
            {t(
              "userPage.kundli.subtitle",
              "Aapki janm-kundli, asli graha-sthiti se bani — aur aapke matches ke saath guna milan.",
            )}
          </p>
        </header>

        {!chart ? (
          <Card variant="soft" padding="lg">
            <p className="text-[0.9375rem] font-semibold text-ink">
              {t("userPage.kundli.needDobTitle", "Kundli ke liye pehle Date of Birth chahiye")}
            </p>
            <p className="mt-1 text-[0.875rem] leading-snug text-muted">
              {t("userPage.kundli.needDobBody", "Bas date daal dijiye — baaki sab hum khud nikaal lete hain.")}
            </p>
            <Link
              href="/profile/build"
              className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold"
            >
              Complete Profile
              <ArrowRight className="size-4" />
            </Link>
          </Card>
        ) : (
          <>
            {/* Chandra card first: it is the one thing that is always exact
                enough to state, and the one thing guna milan runs on. */}
            <Card variant="luxe" padding="md">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
                  <Moon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[0.9375rem] font-semibold text-ink">
                    {t("userPage.kundli.chandraRashi", "Chandra Rashi")}
                  </h2>
                  <p className="mt-0.5 text-[0.8125rem] text-muted">
                    {t(
                      "userPage.kundli.chandraRashiNote",
                      "Janm ke waqt Chandrama kahan tha — kundli milan isi se hota hai.",
                    )}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  [t("userPage.kundli.rashiLabel", "Rashi"), chart.chandra.rashiName],
                  ["Nakshatra", chart.chandra.nakshatraName],
                  [t("userPage.kundli.charanLabel", "Charan"), `${chart.chandra.pada}`],
                  [t("userPage.kundli.nakshatraLordLabel", "Nakshatra swami"), chart.chandra.nakshatraLord],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md bg-bg-subtle px-3 py-2">
                    <dt className="text-[0.6875rem] uppercase tracking-wider text-subtle">{k}</dt>
                    <dd className="mt-0.5 text-[0.875rem] font-semibold text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            {chart.lagna ? (
              <Card variant="default" padding="md">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[0.9375rem] font-semibold text-ink">
                    {t("userPage.kundli.janmKundli", "Janm Kundli")}
                  </h2>
                  <span className="text-[0.75rem] text-subtle">
                    {t("userPage.kundli.lagnaLabel", "Lagna")}: {chart.lagna.rashiName} {chart.lagna.degreeInRashi.toFixed(0)}°
                    {chart.placeName ? ` · ${chart.placeName}` : ""}
                  </span>
                </div>
                <div className="mt-4 flex justify-center">
                  <KundliChartSvg lagnaRashi={chart.lagna.rashi} grahas={chart.grahas} />
                </div>
                <p className="mt-3 text-center text-[0.6875rem] text-subtle">
                  {t("userPage.kundli.chartCaption", "Uttar Bharatiya shaili · ghar ke andar ka number rashi hai")}
                </p>
              </Card>
            ) : (
              <Card variant="soft" padding="md">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-bg text-info">
                    {chart.precision === "no-time" ? (
                      <CalendarClock className="size-4" />
                    ) : (
                      <MapPin className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-semibold text-ink">
                      {chart.precision === "no-time"
                        ? t("userPage.kundli.needTimeTitle", "Lagna ke liye birth time chahiye")
                        : t("userPage.kundli.needPlaceTitle", "Lagna ke liye birth place chahiye")}
                    </p>
                    <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                      {chart.precision === "no-time"
                        ? t(
                            "userPage.kundli.needTimeBody",
                            "Lagna har 4 minute me ek degree badalta hai — bina time ke iska andaaza lagana galat kundli banayega. Isliye hum banate hi nahi. Chandra rashi aur guna milan phir bhi upar kaam kar rahe hain.",
                          )
                        : t(
                            "userPage.kundli.needPlaceBody",
                            "Lagna janm-sthaan ke deshantar par nirbhar hai. Jo shehar aapne likha hai wo hamari list me nahi mila — sahi shehar ka naam daaliye to poori kundli ban jaayegi.",
                          )}
                    </p>
                    <Link
                      href="/profile/build"
                      className="mt-3 inline-flex min-h-12 items-center gap-2 text-[0.8125rem] font-semibold text-wine-700"
                    >
                      {chart.precision === "no-time" ? "Add Birth Time" : "Fix Birth Place"}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </div>
              </Card>
            )}

            <Card variant="default" padding="md">
              <h2 className="text-[0.9375rem] font-semibold text-ink">
                {t("userPage.kundli.grahaSthiti", "Graha sthiti")}
              </h2>
              <ul className="mt-3 divide-y divide-line">
                {chart.grahas.map((g) => (
                  <li key={g.graha} className="flex items-baseline gap-3 py-2">
                    <span className="w-16 shrink-0 text-[0.875rem] font-semibold text-wine-700">
                      {g.graha}
                    </span>
                    <span className="w-24 shrink-0 text-[0.8125rem] text-ink">
                      {g.rashiName} {g.degreeInRashi.toFixed(0)}°
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.75rem] text-subtle">
                      {g.nakshatraName} · {t("userPage.kundli.charanWord", "charan")} {g.pada}
                    </span>
                    {g.bhava !== null && (
                      <span
                        className="shrink-0 rounded-full bg-bg-subtle px-2 py-0.5 text-[0.6875rem] font-medium text-muted"
                        title={BHAVA_MEANING[g.bhava - 1]}
                      >
                        {t("userPage.kundli.bhavWord", "bhav")} {g.bhava}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>

            <Card
              variant={
                chart.manglik.fromLagna ?? chart.manglik.fromMoon ? "warning" : "trust"
              }
              padding="md"
            >
              <h2 className="text-[0.9375rem] font-semibold text-ink">
                {t("userPage.kundli.mangalDosh", "Mangal dosh")}
              </h2>
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                {chart.manglik.fromLagna === null
                  ? `${t("userPage.kundli.manglikMoonPre", "Lagna ke bina poora nirnay nahi ho sakta. Chandra se dekhein to Mangal ")}${bhavaOrdinal(chart.manglik.marsHouseFromMoon, t)}${t("userPage.kundli.manglikMoonMid", " bhav me hai — ")}${chart.manglik.fromMoon ? t("userPage.kundli.manglikYes", "ye manglik shreni me aata hai.") : t("userPage.kundli.manglikNo", "ye manglik shreni me nahi aata.")}`
                  : `${t("userPage.kundli.manglikLagnaPre", "Lagna se Mangal ")}${bhavaOrdinal(chart.manglik.marsHouseFromLagna ?? 1, t)}${t("userPage.kundli.manglikLagnaMid", " bhav me hai aur Chandra se ")}${bhavaOrdinal(chart.manglik.marsHouseFromMoon, t)}${t("userPage.kundli.manglikLagnaPost", " bhav me. ")}${
                      chart.manglik.fromLagna
                        ? t("userPage.kundli.manglikLagnaYes", "Lagna ke hisaab se ye manglik shreni me aata hai.")
                        : t("userPage.kundli.manglikLagnaNo", "Lagna ke hisaab se ye manglik shreni me nahi aata.")
                    }`}
              </p>
              <p className="mt-2 text-[0.75rem] leading-snug text-subtle">
                {t(
                  "userPage.kundli.manglikNote",
                  "Mangal dosh ke kai nivaran (bhang) niyam hain jo poori kundli dekhe bina tay nahi hote. Ye sirf sthiti bata raha hai, faisla nahi.",
                )}
              </p>
            </Card>

            {/* Sits after the chart, the table and the dosha note, because it
                exports exactly those three — offering the file before the
                reader has seen what is in it would be the wrong order. */}
            <KundliExportCard entitled={planCtx.features.kundliPdfExport} />

            {milanRows.length > 0 && (
              <Card variant="default" padding="md">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
                    <Sparkles className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[0.9375rem] font-semibold text-ink">
                      {t("userPage.kundli.milanTitle", "Aapke matches ke saath milan")}
                    </h2>
                    <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
                      {t(
                        "userPage.kundli.milanNote",
                        "Sirf un logon ke saath jinse match ho chuka hai. Guna se ye kabhi tay nahi hota ki aapko kaun dikhega.",
                      )}
                    </p>
                  </div>
                </div>
                <ul className="mt-3 divide-y divide-line">
                  {milanRows.map((row) => (
                    <li key={row.profileId}>
                      <Link
                        href={`/user/profile/${row.profileId}`}
                        className="flex min-h-12 items-center gap-3 py-2.5 transition-colors hover:text-wine-700"
                      >
                        <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium text-ink">
                          {row.name}
                        </span>
                        {row.hasDosha && (
                          <span className="shrink-0 text-[0.6875rem] font-medium text-warn">
                            {t("userPage.kundli.doshChip", "dosh")}
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.75rem] font-semibold ${
                            TONE_CHIP[row.band] ?? "border-line bg-bg-subtle text-muted"
                          }`}
                        >
                          {row.total}/36
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-subtle" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <p className="flex items-start gap-1.5 px-1 text-[0.6875rem] leading-snug text-subtle">
              <Info className="mt-px size-3 shrink-0" />
              <span>
                {t(
                  "userPage.kundli.mathNote",
                  "Ganit Lahiri (Chitrapaksha) ayanamsa par hai, Chandra ki sthiti ek arc-minute se kam ke antar tak. Ye asli ganit hai — par jyotish aur BandhanTak ki matching do alag cheezein hain, aur inme se koi bhi doosre par asar nahi daalta.",
                )}
              </span>
            </p>
          </>
        )}

        {/* Independent of the section above: works whether or not this user
            has ever filled DOB in their own profile, and isn't limited to
            "your own" birth details either. */}
        <ManualKundliCard
          usable={manualUsable}
          usingCreditOnly={!planCtx.features.kundliManualEntry && manualUsable}
          creditsRemaining={planCtx.credits.KUNDLI_UNLOCK}
        />
      </div>
    </UserShell>
  );
}
