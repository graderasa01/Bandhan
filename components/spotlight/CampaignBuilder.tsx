"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, MapPin } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { MAX_TARGET_AGE, MIN_TARGET_AGE, TARGET_GENDERS } from "@/lib/services/spotlight/spotlightPolicy";

/**
 * Choose who sees you, see what that would really cost in days, then buy.
 *
 * The estimate is the point of this screen. Every other matrimony product
 * sells "visibility" as a mood; this one has to say "340 log eligible hain,
 * unme se roz kareeb 48 app kholte hain, to 150 tak pahunchne me 4 din
 * lagenge" — and refuse the sale when that arithmetic does not work. So the
 * Buy button is driven by the server's own verdict (`canDeliver`), never by
 * anything computed here.
 *
 * Estimates are debounced and raced-guarded: the targeting changes faster than
 * the query returns, and showing a stale audience next to fresh filters is how
 * someone buys a pack for a pool that was never quoted.
 */

export interface CampaignPackView {
  code: string;
  name: string;
  description: string;
  price: string;
  reach: number;
  maxDays: number;
}

export interface EstimateView {
  eligibleCount: number;
  avgDailyOpeners: number;
  projectedDays: number | null;
  runningCampaigns: number;
  canDeliver: boolean;
  withinWindow: boolean;
  blockers: string[];
  warnings: string[];
}

export default function CampaignBuilder({
  packs,
  cities,
  defaults,
}: {
  packs: CampaignPackView[];
  cities: { city: string; count: number }[];
  defaults: { targetGender: string | null; minAge: number | null; maxAge: number | null; city: string | null };
}) {
  const { toast } = useToast();

  const [packCode, setPackCode] = useState(packs[0]?.code ?? "");
  const [targetGender, setTargetGender] = useState(
    defaults.targetGender && (TARGET_GENDERS as readonly string[]).includes(defaults.targetGender)
      ? defaults.targetGender
      : TARGET_GENDERS[1],
  );
  const [minAge, setMinAge] = useState(String(defaults.minAge ?? 24));
  const [maxAge, setMaxAge] = useState(String(defaults.maxAge ?? 34));
  const [selectedCities, setSelectedCities] = useState<string[]>(
    defaults.city && cities.some((c) => c.city === defaults.city) ? [defaults.city] : [],
  );

  const [estimate, setEstimate] = useState<EstimateView | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  const pack = useMemo(() => packs.find((p) => p.code === packCode) ?? null, [packs, packCode]);

  // Only the newest request may write state. Without this the reply to an
  // older, wider targeting can land last and overwrite the current numbers.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!pack) return;
    const seq = ++requestSeq.current;
    setEstimating(true);
    setEstimateError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/spotlight/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemCode: pack.code,
            cities: selectedCities,
            minAge: Number(minAge),
            maxAge: Number(maxAge),
            targetGender,
          }),
        });
        const json = await res.json();
        if (seq !== requestSeq.current) return;
        if (!res.ok || !json.ok) {
          setEstimate(null);
          setEstimateError(json.message ?? "Estimate nahi nikal paya.");
          return;
        }
        setEstimate(json.estimate as EstimateView);
      } catch {
        if (seq === requestSeq.current) setEstimateError("Estimate nahi nikal paya — network dekh lein.");
      } finally {
        if (seq === requestSeq.current) setEstimating(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [pack, selectedCities, minAge, maxAge, targetGender]);

  function toggleCity(city: string) {
    setSelectedCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));
  }

  async function buy() {
    if (!pack) return;
    setBuying(true);
    try {
      const res = await fetch("/api/items/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemCode: pack.code,
          campaign: { cities: selectedCities, minAge: Number(minAge), maxAge: Number(maxAge), targetGender },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Campaign shuru nahi hua", description: json.message, tone: "error" });
        setBuying(false);
        return;
      }
      window.location.href = json.checkoutUrl;
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
      setBuying(false);
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Pack chunein</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {packs.map((p) => {
            const active = p.code === packCode;
            return (
              <button
                key={p.code}
                type="button"
                onClick={() => setPackCode(p.code)}
                className={`rounded-lg border p-4 text-left transition-all ${
                  active
                    ? "border-gold-400 bg-gold-50 shadow-sm dark:bg-gold-900/30"
                    : "border-line bg-surface hover:border-gold-300"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.9375rem] font-semibold text-ink">{p.name}</span>
                  <span className="shrink-0 text-lg font-bold text-wine-700">{p.price}</span>
                </div>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{p.description}</p>
                <p className="mt-2 text-[0.75rem] font-medium text-ink">
                  {p.reach} unique log · zyada se zyada {p.maxDays} din
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Kise dikhani hai</h2>
        <Card variant="soft" padding="md" className="space-y-4">
          <div>
            <span className="text-[0.75rem] font-medium text-muted">Kaun</span>
            <div className="mt-1.5 flex gap-2">
              {TARGET_GENDERS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setTargetGender(g)}
                  className={`rounded-full border px-4 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                    targetGender === g
                      ? "border-wine-300 bg-wine-50 text-wine-700 dark:bg-wine-900/50 dark:text-wine-200"
                      : "border-line bg-surface text-muted hover:border-wine-200"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Umar — kam se kam"
              type="number"
              min={MIN_TARGET_AGE}
              max={MAX_TARGET_AGE}
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
            />
            <Input
              label="Umar — zyada se zyada"
              type="number"
              min={MIN_TARGET_AGE}
              max={MAX_TARGET_AGE}
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
            />
          </div>

          <div>
            <span className="text-[0.75rem] font-medium text-muted">
              City — kuch na chunein to poore India me
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {cities.map((c) => {
                const active = selectedCities.includes(c.city);
                return (
                  <button
                    key={c.city}
                    type="button"
                    onClick={() => toggleCity(c.city)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.75rem] font-medium transition-colors ${
                      active
                        ? "border-gold-400 bg-gold-50 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200"
                        : "border-line bg-surface text-muted hover:border-gold-300"
                    }`}
                  >
                    {active ? <Check className="size-3" /> : <MapPin className="size-3" />}
                    {c.city}
                    <span className="text-subtle">{c.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Iska matlab kya hoga</h2>
        <Card variant="luxe" padding="md">
          {estimating && !estimate ? (
            <p className="flex items-center gap-2 text-[0.8125rem] text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Gin rahe hain…
            </p>
          ) : estimateError ? (
            <p className="text-[0.8125rem] text-danger">{estimateError}</p>
          ) : estimate && pack ? (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold text-wine-700">{estimate.eligibleCount}</p>
                  <p className="mt-0.5 text-[0.6875rem] leading-tight text-muted">log eligible hain</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-wine-700">{estimate.avgDailyOpeners}</p>
                  <p className="mt-0.5 text-[0.6875rem] leading-tight text-muted">roz app kholte hain</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-wine-700">{estimate.projectedDays ?? "—"}</p>
                  <p className="mt-0.5 text-[0.6875rem] leading-tight text-muted">
                    din lagenge {pack.reach} tak
                  </p>
                </div>
              </div>

              {estimate.blockers.map((b) => (
                <p key={b} className="mt-3 flex items-start gap-2 text-[0.8125rem] leading-relaxed text-danger">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{b}</span>
                </p>
              ))}
              {estimate.warnings.map((w) => (
                <p key={w} className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
                  {w}
                </p>
              ))}

              {estimate.canDeliver && estimate.blockers.length === 0 && (
                <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
                  Wada sirf itna hai: <strong className="text-ink">{pack.reach} alag-alag log</strong> aapki
                  profile dekhenge. Kitne interest bhejenge, iska koi wada nahi — wo unka faisla hai.
                </p>
              )}
            </>
          ) : null}
        </Card>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={buy}
          loading={buying}
          disabled={!pack || !estimate?.canDeliver || estimating}
        >
          {pack ? `Start ${pack.name} — ${pack.price}` : "Start campaign"}
        </Button>
        {estimate && !estimate.canDeliver && (
          <Pill size="sm" tone="danger">
            Abhi nahi bech sakte
          </Pill>
        )}
      </div>
    </div>
  );
}
