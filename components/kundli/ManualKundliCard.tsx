"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import KundliChartSvg from "@/components/kundli/KundliChartSvg";
import { BHAVA_ORDINAL } from "@/lib/services/kundli/tables";
import type { KundliChart } from "@/lib/contracts/kundli";

/**
 * The paid shortcut, as a self-contained card: type a birth date (and
 * optionally time/place), get a chart back on the same screen — no profile
 * fields, no page reload.
 *
 * Gating is decided server-side (`/api/kundli/manual` re-checks everything —
 * see `manualKundliService.ts`); the two booleans passed in here only decide
 * which UI to *render*. A user could always hand-craft the POST request
 * directly, so the server check is the real gate and this component is just
 * honest about it up front rather than showing a form that would 403 anyway.
 */
export default function ManualKundliCard({
  usable,
  usingCreditOnly,
  creditsRemaining,
}: {
  /** True when the plan allows it outright, or a KUNDLI_UNLOCK credit covers this one use. */
  usable: boolean;
  /** True when `usable` is only true because of a credit, not the plan. */
  usingCreditOnly: boolean;
  creditsRemaining: number;
}) {
  const [dob, setDob] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ chart: KundliChart; usedCredit: boolean } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/kundli/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateOfBirth: dob, birthTime: time || undefined, birthPlace: place || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? "Kundli nahi ban paayi.");
        return;
      }
      setResult({ chart: json.chart, usedCredit: json.usedCredit });
    } catch {
      setError("Network error — dobara try karein.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="default" padding="md">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Turant Kundli Banayen</h2>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
            Kisi ki bhi Date of Birth daaliye — profile bharne ki zaroorat nahi, turant kundli ban jaayegi.
          </p>
        </div>
      </div>

      {!usable ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-line bg-bg-subtle px-3 py-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted" />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-ink">Ye tool paid plans ke saath khulta hai</p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
              Plan upgrade karein, ya mission poora karke ek unlock jeetein. Aapki apni Date of Birth
              profile me daali hui ho to uski kundli hamesha free hai — ye upar &ldquo;Meri Kundli&rdquo; hi hai.
            </p>
            <Link
              href="/user/subscription"
              className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold"
            >
              Plan Dekhein
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      ) : result ? (
        <div className="mt-4 space-y-3">
          {result.usedCredit && (
            <p className="rounded-md bg-info-bg px-3 py-2 text-[0.75rem] text-info">
              1 unlock istemal hua — {Math.max(0, creditsRemaining - 1)} bache hain.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Rashi", result.chart.chandra.rashiName],
              ["Nakshatra", result.chart.chandra.nakshatraName],
              ["Charan", `${result.chart.chandra.pada}`],
              ["Nakshatra swami", result.chart.chandra.nakshatraLord],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md bg-bg-subtle px-3 py-2">
                <dt className="text-[0.6875rem] uppercase tracking-wider text-subtle">{k}</dt>
                <dd className="mt-0.5 text-[0.875rem] font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          {result.chart.lagna ? (
            <div className="flex justify-center py-2">
              <KundliChartSvg lagnaRashi={result.chart.lagna.rashi} grahas={result.chart.grahas} />
            </div>
          ) : (
            <p className="text-[0.75rem] leading-snug text-subtle">
              {result.chart.precision === "no-time"
                ? "Birth time nahi diya gaya, isliye lagna (kundli chart) nahi bana — Chandra rashi upar sahi hai."
                : "Birth place pehchana nahi gaya, isliye lagna nahi bana."}
            </p>
          )}

          <ul className="divide-y divide-line">
            {result.chart.grahas.map((g) => (
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
            {result.chart.manglik.fromLagna === null
              ? `Chandra se Mangal ${BHAVA_ORDINAL[result.chart.manglik.marsHouseFromMoon - 1]} bhav me hai — ${result.chart.manglik.fromMoon ? "manglik shreni me aata hai." : "manglik shreni me nahi aata."}`
              : `Lagna se Mangal ${BHAVA_ORDINAL[(result.chart.manglik.marsHouseFromLagna ?? 1) - 1]} bhav me hai — ${result.chart.manglik.fromLagna ? "manglik shreni me aata hai." : "manglik shreni me nahi aata."}`}
          </p>

          <button
            type="button"
            onClick={() => setResult(null)}
            className="text-[0.8125rem] font-semibold text-wine-700"
          >
            Ek aur kundli banayen
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <Input
            label="Date of Birth"
            name="dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            required
          />
          <Input
            label="Time of Birth (optional)"
            name="time"
            placeholder="Jaise: subah 6:30"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Input
            label="Place of Birth (optional)"
            name="place"
            placeholder="Jaise: Jaipur"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />

          {usingCreditOnly && (
            <p className="text-[0.75rem] text-subtle">
              Aapke plan me ye shamil nahi hai — is baar ek unlock istemal hoga ({creditsRemaining} bache hain).
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-[0.8125rem] text-danger">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth loading={busy} disabled={!dob}>
            Kundli Banayen
          </Button>
        </form>
      )}
    </Card>
  );
}
