"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import Card from "@/components/ui/Card";
import type { GunaMilan, KundliTone } from "@/lib/contracts/kundli";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The 36-guna result, shown the way it should be argued rather than the way it
 * is usually sold.
 *
 * Three things this component deliberately does **not** do:
 *
 *  - No percentage. "24.5 / 36" is the unit the tradition uses and the unit a
 *    pandit will quote back; converting it to 68% invents a precision the
 *    system does not have and invites comparison with the app's own match
 *    score, which measures something else entirely.
 *  - No verdict styling on the total. A low total is toned `caution`, not
 *    `danger` — this is information a family weighs, not a result the app is
 *    handing down. The same reason `KundliNoteList` has always ended every
 *    string with the decision belonging to the family.
 *  - No default-open breakdown. The eight kootas are the *evidence*, and they
 *    are one tap away; leading with them would bury the one number people
 *    actually came for.
 */

const TONE: Record<KundliTone, { chip: string; bar: string }> = {
  ok: { chip: "border-trust/30 bg-trust-bg text-trust", bar: "bg-trust" },
  info: { chip: "border-info/30 bg-info-bg text-info", bar: "bg-info" },
  caution: { chip: "border-warn/35 bg-warn-bg text-warn", bar: "bg-warn" },
};

export interface GunaMilanCardProps {
  milan: GunaMilan;
  /** Whose kundli this is being matched against — "Priya" or "इनकी". */
  otherName?: string;
  /** True when either birth time was missing and the Moon came from local noon. */
  approximate?: boolean;
  className?: string;
}

export default function GunaMilanCard({
  milan,
  otherName,
  approximate = false,
  className,
}: GunaMilanCardProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const tone = TONE[milan.bandTone];
  const pct = Math.max(0, Math.min(100, (milan.total / 36) * 100));

  return (
    <Card variant="luxe" padding="md" className={className}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[0.9375rem] font-semibold text-ink">
            {t("kundli.gunaMilanCard.title", "Kundli Milan")}
            {otherName ? ` — ${otherName}` : ""}
          </h3>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{milan.headline}</p>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-[family-name:var(--font-display)] text-4xl font-bold text-wine-700">
          {milan.total}
        </span>
        <span className="text-lg font-medium text-muted">{t("kundli.gunaMilanCard.outOf36", "/ 36")}</span>
        <span
          className={cn(
            "ml-auto rounded-full border px-2.5 py-0.5 text-[0.75rem] font-semibold",
            tone.chip,
          )}
        >
          {milan.band}
        </span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
        <div className={cn("h-full rounded-full transition-all duration-700", tone.bar)} style={{ width: `${pct}%` }} />
      </div>

      {/* Labelled by role, not by "aap"/"unka": three of the eight kootas are
          asymmetric, so the tradition's own terms are boy and girl — and the
          viewer here may be either one. */}
      <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[0.75rem]">
        <div className="rounded-md bg-bg-subtle px-2.5 py-1.5">
          <dt className="text-subtle">{t("kundli.gunaMilanCard.boyMoon", "Ladke ka Chandra")}</dt>
          <dd className="font-medium text-ink">
            {milan.boy.rashiName} · {milan.boy.nakshatraName}
          </dd>
        </div>
        <div className="rounded-md bg-bg-subtle px-2.5 py-1.5">
          <dt className="text-subtle">{t("kundli.gunaMilanCard.girlMoon", "Ladki ka Chandra")}</dt>
          <dd className="font-medium text-ink">
            {milan.girl.rashiName} · {milan.girl.nakshatraName}
          </dd>
        </div>
      </dl>

      {milan.dosha.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {milan.dosha.map((d) => (
            <li
              key={d.key}
              className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-semibold text-warn">{d.title}</span>
                <span className="block text-[0.8125rem] leading-snug text-muted">{d.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 flex min-h-12 w-full items-center justify-between rounded-md px-1 text-[0.8125rem] font-semibold text-wine-700 transition-colors hover:text-wine-800"
      >
        {t("kundli.gunaMilanCard.eightKootasToggle", "Aath koot ka hisaab")}
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <ul className="space-y-2.5 border-t border-line pt-3">
          {milan.kootas.map((k) => (
            <li key={k.key}>
              <div className="flex items-baseline gap-2">
                <span className="text-[0.8125rem] font-semibold text-ink">{k.label}</span>
                <span
                  className={cn(
                    "rounded-full border px-1.5 text-[0.6875rem] font-semibold",
                    TONE[k.tone].chip,
                  )}
                >
                  {k.score}/{k.max}
                </span>
                <span className="ml-auto text-[0.75rem] text-subtle">
                  {k.boyValue} · {k.girlValue}
                </span>
              </div>
              <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">{k.meaning}</p>
              <p className="mt-0.5 text-[0.75rem] leading-snug text-subtle">{k.verdict}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-[0.6875rem] leading-snug text-subtle">
        <Info className="mt-px size-3 shrink-0" />
        <span>
          {approximate
            ? t(
                "kundli.gunaMilanCard.approximateNote",
                "Kisi ek ka birth time nahi bhara hai, isliye Chandra dopahar ke hisaab se liya gaya hai — nakshatra badal sakta hai. Birth time bharne par ye pakka ho jaayega. ",
              )
            : ""}
          {t(
            "kundli.gunaMilanCard.footnote",
            "Ye ganit asli graha-sthiti (Lahiri ayanamsa) se hai, andaaze se nahi — par guna sirf parampara ka ek paimana hai. Ye kisi rishte ka faisla nahi karta, aur BandhanTak ki matching me iska koi asar nahi hai.",
          )}
        </span>
      </p>
    </Card>
  );
}
