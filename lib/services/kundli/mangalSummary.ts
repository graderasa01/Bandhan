import type { KundliChart } from "@/lib/contracts/kundli";
import type { Translate } from "@/lib/i18n/translate";
import { BHAVA_ORDINAL } from "@/lib/services/kundli/tables";

function bhavaOrdinal(house: number, t: Translate): string {
  return t(`userPage.kundli.bhavaOrdinal${house}`, BHAVA_ORDINAL[house - 1]);
}

/**
 * The Mangal line of the kundli summary — the status and, in the same breath,
 * its limit. From the Moon alone it is "aadha jawab", and the line says so
 * where the status is, not in a footnote.
 *
 * One function for both surfaces that print it: the web's summary card and
 * the native app's Meri Kundli (`/api/mobile/kundli`), so the two can never
 * phrase the same chart differently.
 */
export function mangalSummary(chart: KundliChart, t: Translate): { status: string; detail: string } {
  const m = chart.manglik;
  const bhav = t("userPage.kundli.bhavWord", "bhav");
  if (m.fromLagna === null) {
    return {
      status: m.fromMoon
        ? t("userPage.kundli.mangalMoonYes", "Chandra se manglik shreni me")
        : t("userPage.kundli.mangalMoonNo", "Chandra se manglik shreni me nahi"),
      detail: `${t("userPage.kundli.mangalMoonHouse", "Mangal Chandra se")} ${bhavaOrdinal(m.marsHouseFromMoon, t)} ${bhav} ${t(
        "userPage.kundli.mangalMoonLimit",
        "me hai; Lagna ke bina ye aadha jawab hai.",
      )}`,
    };
  }
  return {
    status: m.fromLagna
      ? t("userPage.kundli.mangalLagnaYes", "Lagna se manglik shreni me")
      : t("userPage.kundli.mangalLagnaNo", "Lagna se manglik shreni me nahi"),
    detail: `${t("userPage.kundli.mangalLagnaHouse", "Mangal Lagna se")} ${bhavaOrdinal(m.marsHouseFromLagna ?? 1, t)} ${bhav}, ${t(
      "userPage.kundli.mangalMoonHouseShort",
      "Chandra se",
    )} ${bhavaOrdinal(m.marsHouseFromMoon, t)} ${bhav} ${t(
      "userPage.kundli.mangalLagnaLimit",
      "me; nivaran niyam poori kundli dekh kar hi tay hote hain.",
    )}`,
  };
}
