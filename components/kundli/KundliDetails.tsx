import { ChevronDown } from "lucide-react";
import { BHAVA_MEANING, BHAVA_ORDINAL } from "@/lib/services/kundli/tables";
import type { KundliChart } from "@/lib/contracts/kundli";
import type { Translate } from "@/lib/i18n/translate";

/**
 * Everything the summary card deliberately leaves out, one tap down: the
 * graha table, the bhava meanings (only when there is a lagna to count them
 * from), the full Mangal note, and the arithmetic behind all of it.
 *
 * A native `<details>` rather than a Sheet: it is a server component with no
 * state to hold, it prints, and a reader who opens it wants to scroll through
 * it in place — not lose the chart behind an overlay.
 */
export default function KundliDetails({ chart, t }: { chart: KundliChart; t: Translate }) {
  const ord = (house: number) => t(`userPage.kundli.bhavaOrdinal${house}`, BHAVA_ORDINAL[house - 1]);
  const grahasByHouse = new Map<number, string[]>();
  for (const g of chart.grahas) {
    if (g.bhava === null) continue;
    grahasByHouse.set(g.bhava, [...(grahasByHouse.get(g.bhava) ?? []), g.graha]);
  }

  return (
    <details className="group rounded-lg border border-line bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 py-3 text-base font-semibold text-ink">
        {t("userPage.kundli.detailsToggle", "Details")}
        <span className="ml-auto text-[0.875rem] font-normal text-subtle">
          {t("userPage.kundli.detailsHint", "graha, bhava, ganit")}
        </span>
        <ChevronDown className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-6 border-t border-line px-5 py-4">
        {/* Graha sthiti */}
        <section>
          <h3 className="text-base font-semibold text-ink">{t("userPage.kundli.grahaSthiti", "Graha sthiti")}</h3>
          <ul className="mt-2 divide-y divide-line">
            {chart.grahas.map((g) => (
              <li key={g.graha} className="flex items-baseline gap-3 py-2">
                <span className="w-16 shrink-0 text-[0.875rem] font-semibold text-wine-700">
                  {g.graha}
                  {g.retrograde && (
                    <span className="ml-1 text-[0.875rem] font-normal text-subtle" title={t("userPage.kundli.vakriTitle", "vakri (retrograde)")}>
                      (v)
                    </span>
                  )}
                </span>
                <span className="w-24 shrink-0 text-[0.875rem] text-ink">
                  {g.rashiName} {g.degreeInRashi.toFixed(0)}°
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.875rem] text-subtle">
                  {g.nakshatraName} · {t("userPage.kundli.charanWord", "charan")} {g.pada}
                </span>
                {g.bhava !== null && (
                  <span
                    className="shrink-0 rounded-full bg-bg-subtle px-2 py-0.5 text-[0.875rem] font-medium text-muted"
                    title={BHAVA_MEANING[g.bhava - 1]}
                  >
                    {t("userPage.kundli.bhavWord", "bhav")} {g.bhava}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!chart.lagna && (
            <p className="mt-2 text-[0.875rem] leading-snug text-subtle">
              {t(
                "userPage.kundli.grahaNoBhavaNote",
                "Bhav Lagna se gine jaate hain — Lagna ke bina yahan sirf rashi aur nakshatra hain, bhav nahi.",
              )}
            </p>
          )}
        </section>

        {/* Bhava meanings — only when a lagna exists to count them from. */}
        {chart.lagna && (
          <section>
            <h3 className="text-base font-semibold text-ink">{t("userPage.kundli.bhavaMeaningTitle", "Barah bhav")}</h3>
            <p className="mt-1 text-[0.875rem] leading-snug text-muted">
              {t("userPage.kundli.bhavaMeaningNote", "Har bhav kis baat ka hai, aur usme kaun sa graha baitha hai.")}
            </p>
            <ol className="mt-2 divide-y divide-line">
              {BHAVA_MEANING.map((meaning, i) => {
                const house = i + 1;
                const sitting = grahasByHouse.get(house);
                return (
                  <li key={house} className="flex items-baseline gap-3 py-2">
                    <span className="w-16 shrink-0 text-[0.875rem] font-semibold capitalize text-wine-700">{ord(house)}</span>
                    <span className="min-w-0 flex-1 text-[0.875rem] text-ink">{meaning}</span>
                    <span className="shrink-0 text-[0.875rem] text-subtle">{sitting ? sitting.join(", ") : "—"}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Mangal — the long form. */}
        <section>
          <h3 className="text-base font-semibold text-ink">{t("userPage.kundli.mangalDosh", "Mangal dosh")}</h3>
          <p className="mt-1 text-[0.875rem] leading-snug text-muted">
            {chart.manglik.fromLagna === null
              ? `${t("userPage.kundli.manglikMoonPre", "Lagna ke bina poora nirnay nahi ho sakta. Chandra se dekhein to Mangal ")}${ord(chart.manglik.marsHouseFromMoon)}${t("userPage.kundli.manglikMoonMid", " bhav me hai — ")}${chart.manglik.fromMoon ? t("userPage.kundli.manglikYes", "ye manglik shreni me aata hai.") : t("userPage.kundli.manglikNo", "ye manglik shreni me nahi aata.")}`
              : `${t("userPage.kundli.manglikLagnaPre", "Lagna se Mangal ")}${ord(chart.manglik.marsHouseFromLagna ?? 1)}${t("userPage.kundli.manglikLagnaMid", " bhav me hai aur Chandra se ")}${ord(chart.manglik.marsHouseFromMoon)}${t("userPage.kundli.manglikLagnaPost", " bhav me. ")}${
                  chart.manglik.fromLagna
                    ? t("userPage.kundli.manglikLagnaYes", "Lagna ke hisaab se ye manglik shreni me aata hai.")
                    : t("userPage.kundli.manglikLagnaNo", "Lagna ke hisaab se ye manglik shreni me nahi aata.")
                }`}
          </p>
          <p className="mt-2 text-[0.875rem] leading-snug text-subtle">
            {t(
              "userPage.kundli.manglikNote",
              "Mangal dosh ke kai nivaran (bhang) niyam hain jo poori kundli dekhe bina tay nahi hote. Ye sirf sthiti bata raha hai, faisla nahi.",
            )}
          </p>
        </section>

        {/* The arithmetic, and the two lines that keep astrology and matching apart. */}
        <section>
          <h3 className="text-base font-semibold text-ink">{t("userPage.kundli.mathTitle", "Ganit aur seema")}</h3>
          <ul className="mt-1 list-disc space-y-1.5 pl-5 text-[0.875rem] leading-snug text-muted">
            <li>
              {t(
                "userPage.kundli.mathAyanamsa",
                "Lahiri (Chitrapaksha) ayanamsa; graha-sthiti asli ephemeris se, Chandra ek arc-minute se kam ke antar tak.",
              )}
            </li>
            <li>
              {chart.precision === "no-time"
                ? t(
                    "userPage.kundli.mathNoTime",
                    "Janm samay nahi hai, isliye Chandra dopahar ke hisaab se liya gaya — rashi aam taur par sahi rehti hai, nakshatra badal sakta hai.",
                  )
                : chart.precision === "no-place"
                  ? t(
                      "userPage.kundli.mathNoPlace",
                      "Janm sthaan nahi mila, isliye Lagna nahi bana — graha apni jagah par sahi hain, bhav nahi gine gaye.",
                    )
                  : t("userPage.kundli.mathFull", "Janm samay aur sthaan dono se — Lagna, bhav aur graha sab gine gaye hain.")}
            </li>
            <li>
              {t(
                "userPage.kundli.mathSeparate",
                "Jyotish aur BandhanTak ki matching do alag cheezein hain — kundli se kabhi tay nahi hota ki aapko kaun dikhega, aur milan kisi rishte ka faisla nahi karta.",
              )}
            </li>
          </ul>
        </section>
      </div>
    </details>
  );
}
