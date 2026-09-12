"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, Download, Lock, MapPin, Sparkles, TriangleAlert } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import KundliChartSvg from "@/components/kundli/KundliChartSvg";
import { BHAVA_ORDINAL } from "@/lib/services/kundli/tables";
import type { KundliChart, KundliInterpretation, KundliSubject, PlaceCandidate } from "@/lib/contracts/kundli";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The paid shortcut, as a self-contained card: type someone's birth details,
 * get a real chart back on the same screen — no profile fields, no reload.
 *
 * ## Why this form asks for four things and accepts "pata nahi"
 *
 * A kundli needs a date, an exact time and a place; the name changes no
 * number but is what makes the result (and the PDF) belong to somebody. So
 * all four are asked for plainly, and the two that people genuinely often do
 * not know have an explicit **"pata nahi"** switch beside them. That switch is
 * the only way to proceed without them — a blank field is a mistake to point
 * at, never a licence to assume noon and Jaipur. The result then carries the
 * matching `precision` badge and says exactly what is missing from it.
 *
 * A typed city that matches two real places (Aurangabad, Bilaspur) comes back
 * as a list to choose from, not a coin flip; a city that matches nothing comes
 * back as a spelling to fix. Neither is ever silently resolved to a default.
 *
 * Gating is decided server-side (`/api/kundli/manual` re-checks everything —
 * see `manualKundliService.ts`); the booleans passed in here only decide which
 * UI to *render*. A user could always hand-craft the POST, so the server check
 * is the real gate and this component is just honest about it up front rather
 * than showing a form that would 403 anyway.
 *
 * Nothing typed here is saved to the user's own profile — see the header of
 * `manualKundliService.ts` for why — and the card says so where people can
 * see it, since the tool is routinely used for a parent or a rishta.
 */

interface ManualResult {
  chart: KundliChart;
  subject: KundliSubject;
  interpretation: KundliInterpretation | null;
  usedCredit: boolean;
}

type FieldKey = "name" | "dateOfBirth" | "birthTime" | "birthPlace";

export default function ManualKundliCard({
  usable,
  usingCreditOnly,
  creditsRemaining,
  pdfEntitled = false,
}: {
  /** True when the plan allows it outright, or a KUNDLI_UNLOCK credit covers this one use. */
  usable: boolean;
  /** True when `usable` is only true because of a credit, not the plan. */
  usingCreditOnly: boolean;
  creditsRemaining: number;
  /** True when this plan can also download the result as a PDF. */
  pdfEntitled?: boolean;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [time, setTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [place, setPlace] = useState("");
  const [placeUnknown, setPlaceUnknown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<FieldKey | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[] | null>(null);
  /**
   * The place the person picked from an ambiguous list, kept for as long as
   * the result is on screen. Without it the PDF's recompute would re-resolve
   * the typed city and hit the same "which one?" question again.
   */
  const [chosenPlace, setChosenPlace] = useState<PlaceCandidate | null>(null);
  const [result, setResult] = useState<ManualResult | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  /** Exactly what the server is asked for — reused verbatim by the PDF call. */
  function payload(override?: PlaceCandidate) {
    const placeChoice = override ?? chosenPlace ?? undefined;
    return {
      name,
      dateOfBirth: dob,
      birthTime: timeUnknown ? undefined : time || undefined,
      birthTimeUnknown: timeUnknown || undefined,
      birthPlace: placeChoice ? undefined : placeUnknown ? undefined : place || undefined,
      placeUnknown: placeUnknown || undefined,
      placeChoice,
    };
  }

  async function run(placeChoice?: PlaceCandidate) {
    setError(null);
    setBadField(null);
    setBusy(true);
    try {
      const res = await fetch("/api/kundli/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(placeChoice)),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        // "Kaunsa Aurangabad?" is a question, not a failure — show the list.
        if (json.code === "PLACE_AMBIGUOUS" && Array.isArray(json.candidates)) {
          // A question, not a failure — so it is asked by the picker below,
          // not shown in the red box the real errors use.
          setCandidates(json.candidates as PlaceCandidate[]);
          setError(null);
          return;
        }
        setCandidates(null);
        if (json.code === "PLACE_UNRESOLVED") setBadField("birthPlace");
        else if (typeof json.field === "string") setBadField(json.field as FieldKey);
        setError(json.message ?? t("kundli.manualCard.genericError", "Kundli nahi ban paayi."));
        return;
      }
      setCandidates(null);
      if (placeChoice) setChosenPlace(placeChoice);
      setResult(json as ManualResult);
    } catch {
      setError(t("kundli.manualCard.networkError", "Network error — dobara try karein."));
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!result) return;
    setPdfError(null);
    setPdfBusy(true);
    try {
      // Re-posted, not re-fetched: the manual chart was never stored, so the
      // server recomputes it from these same details (no second unlock).
      const res = await fetch("/api/kundli/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), interpret: false }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setPdfError(json?.message ?? t("kundli.manualCard.pdfFailed", "PDF nahi ban paayi."));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kundli-${result.subject.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() || "bandhantak"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError(t("kundli.manualCard.networkError", "Network error — dobara try karein."));
    } finally {
      setPdfBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setCandidates(null);
    setChosenPlace(null);
    setError(null);
    setBadField(null);
    setPdfError(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run();
  }

  const canSubmit =
    name.trim().length >= 2 && !!dob && (timeUnknown || time.trim().length > 0) && (placeUnknown || place.trim().length > 0);

  return (
    <Card variant="default" padding="md">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold text-ink">{t("kundli.manualCard.title", "Turant Kundli Banayen")}</h2>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
            {t(
              "kundli.manualCard.subtitle",
              "Kisi ki bhi janm-jaankari daaliye — profile bharne ki zaroorat nahi, turant kundli ban jaayegi.",
            )}
          </p>
        </div>
      </div>

      {!usable ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-line bg-bg-subtle px-3 py-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted" />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-ink">{t("kundli.manualCard.gatedTitle", "Ye tool paid plans ke saath khulta hai")}</p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
              {t(
                "kundli.manualCard.gatedDescPre",
                "Plan upgrade karein, ya mission poora karke ek unlock jeetein. Aapki apni Date of Birth profile me daali hui ho to uski kundli hamesha free hai — ye upar ",
              )}
              &ldquo;{t("kundli.manualCard.myKundliLabel", "Meri Kundli")}&rdquo;
              {t("kundli.manualCard.gatedDescPost", " hi hai.")}
            </p>
            <Link
              href="/user/subscription"
              className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold"
            >
              {t("kundli.manualCard.viewPlans", "View Plans")}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      ) : result ? (
        <ManualResultView
          result={result}
          creditsRemaining={creditsRemaining}
          pdfEntitled={pdfEntitled}
          pdfBusy={pdfBusy}
          pdfError={pdfError}
          onDownload={downloadPdf}
          onReset={reset}
          t={t}
        />
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <Input
            label={t("kundli.manualCard.labelName", "Name")}
            name="kundliName"
            value={name}
            placeholder={t("kundli.manualCard.placeholderName", "Jinki kundli banani hai unka naam")}
            onChange={(e) => setName(e.target.value)}
            error={badField === "name" ? (error ?? undefined) : undefined}
            required
          />
          <Input
            label={t("kundli.manualCard.labelDob", "Date of Birth")}
            name="dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            error={badField === "dateOfBirth" ? (error ?? undefined) : undefined}
            required
          />

          <div>
            <Input
              label={t("kundli.manualCard.labelTime", "Time of Birth")}
              name="time"
              placeholder={t("kundli.manualCard.placeholderTime", "Jaise: subah 6:30")}
              value={timeUnknown ? "" : time}
              disabled={timeUnknown}
              onChange={(e) => setTime(e.target.value)}
              error={badField === "birthTime" ? (error ?? undefined) : undefined}
              helperText={t("kundli.manualCard.helperTime", "Lagna isi se banta hai — jitna sahi, utni poori kundli.")}
            />
            <UnknownToggle
              checked={timeUnknown}
              onChange={(next) => {
                setTimeUnknown(next);
                setBadField(null);
              }}
              label={t("kundli.manualCard.timeUnknown", "Janm samay pata nahi")}
            />
          </div>

          <div>
            <Input
              label={t("kundli.manualCard.labelPlace", "Place of Birth")}
              name="place"
              placeholder={t("kundli.manualCard.placeholderPlace", "Jaise: Jaipur, Rajasthan")}
              value={placeUnknown ? "" : place}
              disabled={placeUnknown}
              onChange={(e) => {
                setPlace(e.target.value);
                setCandidates(null);
                setChosenPlace(null);
              }}
              error={badField === "birthPlace" ? (error ?? undefined) : undefined}
            />
            <UnknownToggle
              checked={placeUnknown}
              onChange={(next) => {
                setPlaceUnknown(next);
                setCandidates(null);
                setChosenPlace(null);
                setBadField(null);
              }}
              label={t("kundli.manualCard.placeUnknown", "Janm sthaan pata nahi")}
            />
          </div>

          {(timeUnknown || placeUnknown) && (
            <p className="flex items-start gap-2 rounded-md bg-warn-bg px-3 py-2 text-[0.75rem] leading-snug text-warn">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {t(
                  "kundli.manualCard.partialWarning",
                  "Iske bina kundli adhoori banegi — lagna, bhava aur poora Mangal-dosh nirnay nahi aayenge. Chandra rashi, nakshatra aur guna milan phir bhi sahi rehte hain.",
                )}
              </span>
            </p>
          )}

          {candidates && candidates.length > 0 && (
            <div className="rounded-md border border-line bg-bg-subtle p-3">
              <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
                <MapPin className="size-4 text-muted" />
                {t("kundli.manualCard.pickPlace", "Kaunsi jagah? Ek chunein:")}
              </p>
              <div className="mt-2 space-y-1.5">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(c)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2 text-left text-[0.8125rem] hover:border-gold-500 disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{c.name}</span>
                      <span className="block truncate text-[0.75rem] text-subtle">{c.region}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {usingCreditOnly && (
            <p className="text-[0.75rem] text-subtle">
              {t("kundli.manualCard.creditWillBeUsedPre", "Aapke plan me ye shamil nahi hai — is baar ek unlock istemal hoga (")}
              {creditsRemaining}
              {t("kundli.manualCard.creditWillBeUsedPost", " bache hain).")}
            </p>
          )}

          {error && !badField && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-[0.8125rem] text-danger">
              {error}
            </p>
          )}

          <p className="text-[0.75rem] leading-snug text-subtle">
            {t(
              "kundli.manualCard.notSavedNote",
              "Yahan bhari jaankari kahin save nahi hoti — na aapki profile me, na kisi aur ke paas. Sirf ye kundli banane ke liye istemal hoti hai.",
            )}
          </p>

          <Button type="submit" fullWidth loading={busy} disabled={!canSubmit}>
            {t("kundli.manualCard.createKundli", "Create Kundli")}
          </Button>
        </form>
      )}
    </Card>
  );
}

/** The "pata nahi" switch — the only sanctioned way past a missing time or place. */
function UnknownToggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <label className="mt-1.5 flex min-h-12 cursor-pointer items-center gap-2 text-[0.8125rem] text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
}

function precisionCopy(chart: KundliChart, t: ReturnType<typeof useT>): { label: string; detail: string; tone: "ok" | "warn" } {
  if (chart.precision === "full") {
    return {
      tone: "ok",
      label: t("kundli.manualCard.precisionFull", "Poori kundli"),
      detail: t("kundli.manualCard.precisionFullDetail", "Janm tithi, samay aur sthaan — teeno mil gaye, isliye lagna aur bhava bhi bane hain."),
    };
  }
  if (chart.precision === "no-time") {
    return {
      tone: "warn",
      label: t("kundli.manualCard.precisionNoTime", "Adhoori — janm samay ke bina"),
      detail: t(
        "kundli.manualCard.precisionNoTimeDetail",
        "Chandra sthaaniya dopahar ke hisaab se rakha gaya hai. Rashi lagbhag hamesha sahi rehti hai, lekin lagna, bhava aur poora Mangal-dosh nirnay is kundli me nahi hain.",
      ),
    };
  }
  return {
    tone: "warn",
    label: t("kundli.manualCard.precisionNoPlace", "Adhoori — janm sthaan ke bina"),
    detail: t(
      "kundli.manualCard.precisionNoPlaceDetail",
      "Sthaan (ya uska time-zone) pehchana nahi gaya, isliye samay ko IST maankar graha nikale gaye hain aur lagna nahi banaya gaya.",
    ),
  };
}

function ManualResultView({
  result,
  creditsRemaining,
  pdfEntitled,
  pdfBusy,
  pdfError,
  onDownload,
  onReset,
  t,
}: {
  result: ManualResult;
  creditsRemaining: number;
  pdfEntitled: boolean;
  pdfBusy: boolean;
  pdfError: string | null;
  onDownload: () => void;
  onReset: () => void;
  t: ReturnType<typeof useT>;
}) {
  const { chart, subject, interpretation } = result;
  const precision = precisionCopy(chart, t);

  return (
    <div className="mt-4 space-y-3">
      {result.usedCredit && (
        <p className="rounded-md bg-info-bg px-3 py-2 text-[0.75rem] text-info">
          {t("kundli.manualCard.unlockUsedPre", "1 unlock istemal hua — ")}
          {Math.max(0, creditsRemaining - 1)}
          {t("kundli.manualCard.unlockUsedPost", " bache hain.")}
        </p>
      )}

      {/* Whose kundli this is, and from exactly which inputs. */}
      <div className="rounded-md border border-line bg-bg-subtle px-3 py-2.5">
        <p className="text-[0.9375rem] font-semibold text-ink">{subject.name}</p>
        <dl className="mt-1 space-y-0.5 text-[0.75rem] text-muted">
          <div className="flex gap-1.5">
            <dt className="text-subtle">{t("kundli.manualCard.rowDob", "Janm tithi:")}</dt>
            <dd>{subject.dateOfBirth}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-subtle">{t("kundli.manualCard.rowTime", "Janm samay:")}</dt>
            <dd>
              {chart.birthTimeResolved
                ? `${subject.birthTime}${subject.birthTime?.trim() === chart.birthTimeResolved ? "" : ` (${chart.birthTimeResolved})`}`
                : subject.birthTimeUnknown
                  ? t("kundli.manualCard.rowTimeUnknown", "pata nahi")
                  : t("kundli.manualCard.rowTimeMissing", "nahi mila")}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-subtle">{t("kundli.manualCard.rowPlace", "Janm sthaan:")}</dt>
            <dd>
              {chart.place
                ? `${chart.place.name} · ${chart.place.lat.toFixed(2)}°, ${chart.place.lon.toFixed(2)}°${chart.place.timeZoneId ? ` · ${chart.place.timeZoneId}` : ""}`
                : t("kundli.manualCard.rowPlaceUnknown", "pata nahi")}
            </dd>
          </div>
        </dl>
        <p
          className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
            precision.tone === "ok" ? "bg-trust-bg text-trust" : "bg-warn-bg text-warn"
          }`}
        >
          {precision.tone === "ok" ? <Check className="size-3" /> : <TriangleAlert className="size-3" />}
          {precision.label}
        </p>
        <p className="mt-1.5 text-[0.75rem] leading-snug text-subtle">{precision.detail}</p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("kundli.manualCard.fieldRashi", "Rashi"), chart.chandra.rashiName],
          [t("kundli.manualCard.fieldNakshatra", "Nakshatra"), chart.chandra.nakshatraName],
          [t("kundli.manualCard.fieldCharan", "Charan"), `${chart.chandra.pada}`],
          [t("kundli.manualCard.fieldNakshatraSwami", "Nakshatra swami"), chart.chandra.nakshatraLord],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-bg-subtle px-3 py-2">
            <dt className="text-[0.6875rem] uppercase tracking-wider text-subtle">{k}</dt>
            <dd className="mt-0.5 text-[0.875rem] font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {chart.lagna ? (
        <div className="flex justify-center py-2">
          <KundliChartSvg lagnaRashi={chart.lagna.rashi} grahas={chart.grahas} />
        </div>
      ) : (
        <p className="text-[0.75rem] leading-snug text-subtle">
          {chart.precision === "no-time"
            ? t(
                "kundli.manualCard.noLagnaNoTime",
                "Birth time nahi diya gaya, isliye lagna (kundli chart) nahi bana — Chandra rashi upar sahi hai.",
              )
            : t("kundli.manualCard.noLagnaNoPlace", "Birth place pehchana nahi gaya, isliye lagna nahi bana.")}
        </p>
      )}

      <ul className="divide-y divide-line">
        {chart.grahas.map((g) => (
          <li key={g.graha} className="flex items-baseline gap-3 py-1.5 text-[0.8125rem]">
            <span className="w-14 shrink-0 font-semibold text-wine-700">{g.graha}</span>
            <span className="w-20 shrink-0 text-ink">
              {g.rashiName} {g.degreeInRashi.toFixed(0)}°
            </span>
            <span className="min-w-0 flex-1 truncate text-subtle">{g.nakshatraName}</span>
          </li>
        ))}
      </ul>

      <p className="text-[0.75rem] leading-snug text-subtle">
        {chart.manglik.fromLagna === null
          ? `${t("kundli.manualCard.manglikFromMoonPre", "Chandra se Mangal ")}${BHAVA_ORDINAL[chart.manglik.marsHouseFromMoon - 1]}${t("kundli.manualCard.manglikBhavMeHai", " bhav me hai — ")}${chart.manglik.fromMoon ? t("kundli.manualCard.manglikYes", "manglik shreni me aata hai.") : t("kundli.manualCard.manglikNo", "manglik shreni me nahi aata.")} ${t("kundli.manualCard.manglikPartialNote", "Lagna ke bina ye aadha jawab hai.")}`
          : `${t("kundli.manualCard.manglikFromLagnaPre", "Lagna se Mangal ")}${BHAVA_ORDINAL[(chart.manglik.marsHouseFromLagna ?? 1) - 1]}${t("kundli.manualCard.manglikBhavMeHai", " bhav me hai — ")}${chart.manglik.fromLagna ? t("kundli.manualCard.manglikYes", "manglik shreni me aata hai.") : t("kundli.manualCard.manglikNo", "manglik shreni me nahi aata.")}`}
      </p>

      {interpretation && <InterpretationBlock interpretation={interpretation} t={t} />}

      {pdfEntitled && (
        <div>
          <Button type="button" variant="secondary" size="sm" loading={pdfBusy} onClick={onDownload} icon={<Download className="size-4" />}>
            {t("kundli.manualCard.downloadPdf", "Download PDF")}
          </Button>
          {pdfError && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-danger">
              {pdfError}
            </p>
          )}
        </div>
      )}

      <button type="button" onClick={onReset} className="text-[0.8125rem] font-semibold text-wine-700">
        {t("kundli.manualCard.createAnother", "Create Another Kundli")}
      </button>
    </div>
  );
}

/** Astro-AI — prose about numbers code already computed. Absent when the model is unavailable. */
function InterpretationBlock({ interpretation, t }: { interpretation: KundliInterpretation; t: ReturnType<typeof useT> }) {
  const sections = (
    [
      [t("kundli.manualCard.aiTemperament", "Swabhav"), interpretation.temperament],
      [t("kundli.manualCard.aiStrengths", "Mazbooti"), interpretation.strengths],
      [t("kundli.manualCard.aiDiscuss", "Baat karne layak"), interpretation.discuss],
    ] as Array<[string, string[]]>
  ).filter(([, lines]) => lines.length > 0);

  return (
    <div className="rounded-md border border-gold-300 bg-gradient-to-br from-gold-50 to-surface p-3 dark:from-gold-900/30 dark:to-surface">
      <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink">
        <Sparkles className="size-4 text-gold-700 dark:text-gold-200" />
        {t("kundli.manualCard.aiTitle", "Paramparik vyakhya")}
      </p>
      <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink">{interpretation.summary}</p>

      {sections.map(([title, lines]) => (
        <div key={title} className="mt-2.5">
          <p className="text-[0.6875rem] uppercase tracking-wider text-subtle">{title}</p>
          <ul className="mt-1 space-y-1">
            {lines.map((line) => (
              <li key={line} className="flex gap-2 text-[0.8125rem] leading-snug text-muted">
                <span aria-hidden className="text-gold-700 dark:text-gold-200">
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {interpretation.gunaNotes.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {interpretation.gunaNotes.map((n) => (
            <li key={n.key} className="text-[0.8125rem] leading-snug text-muted">
              <span className="font-semibold text-ink">{n.label}:</span> {n.note}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 text-[0.6875rem] leading-snug text-subtle">{interpretation.note}</p>
      <p className="mt-1 text-[0.6875rem] text-subtle">
        {t("kundli.manualCard.aiProviderPre", "AI se · ")}
        {interpretation.provider}
      </p>
    </div>
  );
}
