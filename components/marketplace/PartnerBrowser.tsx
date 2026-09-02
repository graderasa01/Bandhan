"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Clock, MapPin, Search, ShieldCheck, Star, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { NO_GUARANTEE_NOTE, SERVICE_KINDS, rupees } from "@/lib/services/marketplace/servicePolicy";
import type { PartnerCard } from "@/lib/services/marketplace/marketplaceSearchService";
import type { CoverageVerdict } from "@/lib/services/pilot/pilotCityService";
import type { PartnerServiceKind } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * The public partner list.
 *
 * Filtering happens on the server (`/api/partners`) rather than over a
 * client-side copy of every listing: the card carries measured stats that come
 * from booking queries, and shipping the whole marketplace to the browser to
 * filter four fields would get slower with every partner who joins.
 *
 * Every card ends with the same line about what a service is not. It appears
 * once per card rather than once per page because a card is what gets
 * screenshotted and forwarded.
 */
export default function PartnerBrowser({
  initialPartners,
  initialCoverage = null,
  initialCity = "",
  facets,
}: {
  initialPartners: PartnerCard[];
  initialCoverage?: CoverageVerdict | null;
  initialCity?: string;
  facets: { cities: string[]; languages: string[] };
}) {
  const [partners, setPartners] = useState(initialPartners);
  const [coverage, setCoverage] = useState<CoverageVerdict | null>(initialCoverage);
  const [city, setCity] = useState(initialCity);
  const [language, setLanguage] = useState("");
  const [kind, setKind] = useState<PartnerServiceKind | "">("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = useMemo(
    () => [city, language, kind, availableOnly ? "1" : ""].filter(Boolean).length,
    [city, language, kind, availableOnly],
  );

  async function apply(next?: Partial<{ city: string; language: string; kind: string; availableOnly: boolean }>) {
    const params = new URLSearchParams();
    const c = next?.city ?? city;
    const l = next?.language ?? language;
    const k = next?.kind ?? kind;
    const a = next?.availableOnly ?? availableOnly;
    if (c) params.set("city", c);
    if (l) params.set("language", l);
    if (k) params.set("kind", k);
    if (a) params.set("available", "1");

    setBusy(true);
    try {
      const res = await fetch(`/api/partners?${params.toString()}`);
      if (res.ok) {
        const body = (await res.json()) as { partners: PartnerCard[]; coverage: CoverageVerdict | null };
        setPartners(body.partners);
        setCoverage(body.coverage);
      }
    } catch {
      /* offline — the list on screen stays, which is better than emptying it */
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCity("");
    setLanguage("");
    setKind("");
    setAvailableOnly(false);
    void apply({ city: "", language: "", kind: "", availableOnly: false });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-wine-700">Verified partners</h1>
        <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-muted">
          Pandit ji, marriage bureau aur rishta consultants — jo BandhanTak par verify ho chuke hain. Har
          service ki keemat, kya milega aur refund ka niyam pehle se likha hai.
        </p>
      </header>

      <Card variant="soft" padding="md" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-muted">City</span>
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                void apply({ city: e.target.value });
              }}
              className="mt-1 h-12 w-full rounded-full border border-line-strong bg-surface px-4 text-sm text-ink"
            >
              <option value="">Saari cities</option>
              {/* The facets only carry cities that have a listed partner, so a
                  city arriving in `?city=` — which is exactly a city with none —
                  would leave the box reading "Saari cities" while the page
                  below talks about Kochi. */}
              {city && !facets.cities.includes(city) && <option value={city}>{city}</option>}
              {facets.cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted">Bhasha</span>
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                void apply({ language: e.target.value });
              }}
              className="mt-1 h-12 w-full rounded-full border border-line-strong bg-surface px-4 text-sm text-ink"
            >
              <option value="">Koi bhi</option>
              {facets.languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted">Service</span>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as PartnerServiceKind | "");
                void apply({ kind: e.target.value });
              }}
              className="mt-1 h-12 w-full rounded-full border border-line-strong bg-surface px-4 text-sm text-ink"
            >
              <option value="">Saari services</option>
              {SERVICE_KINDS.map((s) => (
                <option key={s.kind} value={s.kind}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => {
                setAvailableOnly(e.target.checked);
                void apply({ availableOnly: e.target.checked });
              }}
              className="size-4 accent-[var(--color-gold-600)]"
            />
            Sirf wahi jo abhi le rahe hain
          </label>
          {active > 0 && (
            <Button size="sm" variant="ghost" onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {busy && <p className="mb-3 text-sm text-muted">Dhoondh rahe hain…</p>}

      {coverage && coverage.state !== "SERVED" && (
        <CityCoverageNotice coverage={coverage} kind={kind || null} />
      )}

      {partners.length === 0 ? (
        // Only reached without a city filter, or with one whose notice is
        // already above: a city that cannot serve you deserves the reason, not
        // the shrug that "naye partner jud rahe hain" would be in Kochi.
        coverage ? null : (
          <Card variant="soft" padding="lg" className="text-center">
            <Search className="mx-auto size-10 text-muted" aria-hidden />
            <p className="mt-3 font-semibold text-ink">Is filter par koi partner nahi mila.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
              City ya service badal kar dekhiye — marketplace abhi shuru hua hai aur naye partner jud rahe hain.
            </p>
          </Card>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {partners.map((p) => (
            <PartnerRow key={p.partnerId} partner={p} />
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-muted">{NO_GUARANTEE_NOTE}</p>
    </div>
  );
}

/**
 * What a city that cannot serve you is told, and the one thing it can offer.
 *
 * The three sentences are deliberately different. "Hum yahan abhi nahi hain",
 * "yahan sab bhare hue hain" and "yahan ye kaam koi nahi karta" are three
 * different facts, and collapsing them into one empty state — which is what
 * this page did before — leaves somebody in Kochi refreshing a filter that will
 * never fill.
 *
 * The waitlist button is the only ask, and it needs an account: a promise to
 * come back to somebody has to have somewhere to come back to. Signed-out
 * visitors are sent to log in with the city intact rather than being asked for
 * a phone number here.
 */
function CityCoverageNotice({
  coverage,
  kind,
}: {
  coverage: Exclude<CoverageVerdict, { state: "SERVED" }>;
  kind: PartnerServiceKind | null;
}) {
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const headline =
    coverage.state === "NOT_OPEN"
      ? coverage.status === "PAUSED"
        ? `${coverage.city} me hum abhi nayi booking nahi le rahe.`
        : `BandhanTak abhi ${coverage.city} me shuru nahi hua.`
      : coverage.state === "UNKNOWN"
        ? `${coverage.city} me abhi hamare koi partner nahi hain.`
        : coverage.reason === "NO_PARTNER_FOR_KIND"
          ? `${coverage.city} me ye service karne wala abhi koi nahi hai.`
          : `${coverage.city} ke saare partner abhi bhare hue hain.`;

  async function join() {
    setState("saving");
    try {
      const res = await fetch("/api/partners/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: coverage.city, reason: coverage.reason, kind: kind ?? undefined }),
      });
      if (res.status === 401) {
        const next = `/partners?city=${encodeURIComponent(coverage.city)}`;
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
        return;
      }
      const body = (await res.json()) as { ok?: boolean; message?: string };
      if (res.ok) {
        setState("done");
        setMessage(body.message ?? "Likh liya.");
      } else {
        setState("idle");
        setMessage(body.message ?? "Abhi save nahi ho paya. Thodi der me try kijiye.");
      }
    } catch {
      setState("idle");
      setMessage("Internet nahi mila. Thodi der me try kijiye.");
    }
  }

  return (
    <Card variant="soft" padding="lg" className="mb-4">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{headline}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {coverage.note ??
              "Hum ek sheher me tabhi shuru karte hain jab wahan itne partner ho jaayein ki har parivaar ko sach me jawab mile."}
          </p>

          {state === "done" ? (
            <p className="mt-3 text-sm font-medium text-trust">{message}</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={join} disabled={state === "saving"}>
                {state === "saving" ? "Likh rahe hain…" : "Khulte hi bata dijiye"}
              </Button>
              {message && <span className="text-sm text-muted">{message}</span>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function PartnerRow({ partner }: { partner: PartnerCard }) {
  return (
    <Link href={`/partners/${partner.partnerId}`} className="block">
      <Card variant="interactive" padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-ink">{partner.displayName}</h2>
              {partner.verified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-trust/30 bg-trust-bg px-2 py-0.5 text-[0.6875rem] font-medium text-trust">
                  <BadgeCheck className="size-3" aria-hidden />
                  Verified
                </span>
              )}
              {partner.kycStatus === "VERIFIED" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-[0.6875rem] font-medium text-muted">
                  <ShieldCheck className="size-3" aria-hidden />
                  KYC done
                </span>
              )}
            </div>
            {partner.headline && <p className="mt-1 text-sm leading-relaxed text-muted">{partner.headline}</p>}
          </div>

          {partner.fromPricePaise !== null && (
            <div className="shrink-0 text-right">
              <p className="text-[0.6875rem] text-muted">Shuru</p>
              <p className="text-lg font-semibold tabular-nums text-ink">{rupees(partner.fromPricePaise)}</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          {partner.cities.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {partner.cities.slice(0, 3).join(", ")}
              {partner.cities.length > 3 ? ` +${partner.cities.length - 3}` : ""}
            </span>
          )}
          {partner.languages.length > 0 && <span>{partner.languages.join(" · ")}</span>}
          {partner.stats.medianAcceptHours !== null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              ~{partner.stats.medianAcceptHours}h me jawaab
            </span>
          )}
          {partner.stats.averageRating !== null && (
            <span className="inline-flex items-center gap-1 text-gold-700 dark:text-gold-300">
              <Star className="size-3.5 fill-current" aria-hidden />
              {partner.stats.averageRating} ({partner.stats.reviewCount})
            </span>
          )}
          {partner.stats.completionRatePercent !== null && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden />
              {partner.stats.completionRatePercent}% poori hui
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {partner.services.slice(0, 4).map((s) => (
            <span
              key={s.id}
              className="rounded-full border border-line bg-bg-subtle px-2.5 py-1 text-[0.75rem] text-ink"
            >
              {s.kindLabel} · {rupees(s.priceInPaise)}
            </span>
          ))}
        </div>

        {(!partner.accepting || partner.full) && (
          <p
            className={cn(
              "mt-3 inline-block rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium",
              "border-warn/40 bg-warn-bg text-warn",
            )}
          >
            {!partner.accepting ? "Abhi nayi booking nahi le rahe" : "Abhi full hain"}
          </p>
        )}
      </Card>
    </Link>
  );
}
