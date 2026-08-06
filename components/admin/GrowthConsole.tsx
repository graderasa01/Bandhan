"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Bot,
  Handshake,
  IndianRupee,
  LockKeyhole,
  RefreshCw,
  Scale,
  TrendingDown,
  Users,
} from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import { GROWTH_WINDOWS, type GrowthSnapshot } from "@/lib/contracts/growth";
import { cn } from "@/lib/utils";

/**
 * The Growth Console's one job: make the *next decision* obvious.
 *
 * So the order on this page is not "most impressive first" — it is the order a
 * decision gets made in. Where people fall out (funnel), whether they come back
 * (retention), which locked door is holding the most people (gates), whether
 * the two sides of the marketplace are balanced, and only then the money.
 * Revenue is the score, not the lever.
 *
 * Nothing here is a projection. Where a figure is arithmetic rather than a raw
 * count — the gate ceilings — the card says so in words, because a number
 * that looks like forecast revenue will be treated as forecast revenue.
 */
export default function GrowthConsole({ initial }: { initial: GrowthSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [busyWindow, setBusyWindow] = useState<number | null>(null);
  const { toast } = useToast();

  async function load(days: number) {
    setBusyWindow(days);
    try {
      const res = await fetch(`/api/admin/growth?days=${days}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message ?? "Load nahi hua");
      startTransition(() => setSnap(data.snapshot as GrowthSnapshot));
    } catch (err) {
      toast({
        title: "Growth data load nahi hua",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setBusyWindow(null);
    }
  }

  return (
    <div className={cn("space-y-6", pending && "opacity-70")}>
      {/* ---- Window switcher ---------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Window:</span>
        {GROWTH_WINDOWS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => load(d)}
            disabled={busyWindow !== null}
            aria-pressed={snap.windowDays === d}
            className={cn(
              "min-h-9 rounded-full px-4 text-sm font-medium transition-colors disabled:opacity-60",
              snap.windowDays === d
                ? "bg-wine-700 text-white"
                : "border border-line bg-surface text-muted hover:text-ink",
            )}
          >
            {busyWindow === d ? "…" : `${d} din`}
          </button>
        ))}
        <button
          type="button"
          onClick={() => load(snap.windowDays)}
          disabled={busyWindow !== null}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-muted transition-colors hover:text-ink disabled:opacity-60"
        >
          <RefreshCw className={cn("size-4", busyWindow !== null && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* ---- Headline ------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Users className="size-4" />}
          label="Naye signups"
          value={String(snap.funnel[0]?.count ?? 0)}
          sub={`${snap.windowDays} din mein`}
        />
        <Stat
          icon={<IndianRupee className="size-4" />}
          label="MRR"
          value={paiseToRupeeDisplay(snap.revenue.mrrPaise)}
          sub={`${snap.revenue.payingUsers} paying member`}
        />
        <Stat
          icon={<Scale className="size-4" />}
          label="Ladka : Ladki"
          value={snap.marketplace.ratio === null ? "—" : `${snap.marketplace.ratio} : 1`}
          sub={`${snap.marketplace.liveProfiles} live profiles`}
        />
        <Stat
          icon={<LockKeyhole className="size-4" />}
          label="Sabse bada gate"
          value={String(snap.gates[0]?.people ?? 0)}
          sub={snap.gates[0]?.unlockPlanName ? `${snap.gates[0].unlockPlanName} kholta hai` : "—"}
        />
      </div>

      {/* ---- Funnel --------------------------------------------------- */}
      <Card padding="lg">
        <SectionHead
          icon={<TrendingDown className="size-4" />}
          title="Funnel"
          note={`Sirf is window mein bane accounts. Har step pichhle step ka subset hai — isliye number kabhi upar nahi ja sakta.`}
        />
        <div className="mt-4 space-y-2">
          {snap.funnel.map((step, i) => {
            const width = snap.funnel[0].count > 0 ? (step.count / snap.funnel[0].count) * 100 : 0;
            const bigDrop = step.stepPct !== null && step.stepPct < 50 && snap.funnel[i - 1].count >= 10;
            return (
              <div key={step.id} className="rounded-md border border-line p-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-ink">{step.label}</span>
                  <span className="text-lg font-semibold tabular-nums text-ink">{step.count}</span>
                  {step.stepPct !== null && (
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 text-xs font-medium tabular-nums",
                        bigDrop ? "bg-danger-bg text-danger" : "bg-bg-subtle text-muted",
                      )}
                    >
                      {step.stepPct}% aage badhe
                    </span>
                  )}
                  <span className="ml-auto text-xs tabular-nums text-muted">
                    {step.ofTotalPct}% of total
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-subtle">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted">{step.detail}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---- Gate pressure -------------------------------------------- */}
      <Card padding="lg" variant="luxe">
        <SectionHead
          icon={<LockKeyhole className="size-4" />}
          title="Gate pressure — abhi kaun deewar par khada hai"
          note="Har number aaj ke row-count hain, window ka nahi. Ye log kaam kar chuke hain — match, shortlist, voice note — aur humare banaye lock par ruke hain."
        />
        <div className="mt-4 space-y-2">
          {snap.gates.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface p-3"
            >
              <span className="text-xl font-bold tabular-nums text-wine-700">{g.people}</span>
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium text-ink">{g.label}</p>
                <p className="text-xs text-muted">{g.detail}</p>
              </div>
              <div className="text-right">
                <span className="rounded-sm bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-800 dark:bg-gold-900/40 dark:text-gold-200">
                  {g.unlockPlanName} se khulta hai
                </span>
                <p className="mt-1 text-xs tabular-nums text-muted">
                  ceiling {paiseToRupeeDisplay(g.ceilingPaise)}/mahina
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 flex gap-2 rounded-md bg-warn-bg p-3 text-xs text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Ceiling forecast nahi hai.</b> Ye sirf people × plan ka aaj ka daam hai — yaani
            &ldquo;agar in sab ne upgrade kar liya&rdquo;. Asli conversion iska ek chhota hissa hi
            hoga. Aur ye counts sirf Subscription se plan padhte hain: admin ke diye hue entitlement
            override aur reward credits isme shaamil nahi.
          </span>
        </p>
      </Card>

      {/* ---- Retention ------------------------------------------------ */}
      <Card padding="lg">
        <SectionHead
          icon={<RefreshCw className="size-4" />}
          title="Retention"
          note="Calendar-week cohort: jo hafte W mein bane, unme se kitne hafte W+1 (aur W+4) mein kuchh kiya — swipe, interest, message, shortlist ya poll vote. Sirf login count nahi hota, kyunki session mahina bhar chal sakta hai."
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-3 font-medium">Signup hafta</th>
                <th className="pb-2 pr-3 font-medium">Signups</th>
                <th className="pb-2 pr-3 font-medium">Week 1</th>
                <th className="pb-2 font-medium">Week 4</th>
              </tr>
            </thead>
            <tbody>
              {snap.retention.map((r) => (
                <tr key={r.label} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3 text-ink">{r.label}</td>
                  <td className="py-2 pr-3 tabular-nums text-ink">{r.signups}</td>
                  <td className="py-2 pr-3 tabular-nums text-muted">{retCell(r.week1, r.signups)}</td>
                  <td className="py-2 tabular-nums text-muted">{retCell(r.week4, r.signups)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---- Marketplace ---------------------------------------------- */}
      <Card padding="lg">
        <SectionHead
          icon={<Scale className="size-4" />}
          title="Marketplace health"
          note="Matrimony product pehle ratio se marta hai, revenue se baad mein. Majority side ko 'koi reply nahi karta' mehsoos hone lagta hai — aur tab tak churn ho chuka hota hai."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Live profiles</p>
            <div className="mt-2 space-y-1.5">
              {snap.marketplace.byGender.map((g) => (
                <div key={g.label} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-sm text-ink">{g.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-subtle">
                    <div
                      className="h-full rounded-full bg-trust"
                      style={{
                        width: `${snap.marketplace.liveProfiles > 0 ? (g.count / snap.marketplace.liveProfiles) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm tabular-nums text-muted">{g.count}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">
              Is window mein {snap.marketplace.newLiveInWindow} nayi profile live hui.
            </p>
            <p className="mt-1 text-sm text-danger">
              {snap.marketplace.neverReceivedInterest} live profiles ko aaj tak ek bhi interest nahi
              aaya.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Top cities</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {snap.marketplace.topCities.length === 0 && (
                <span className="text-sm text-muted">Abhi koi city data nahi.</span>
              )}
              {snap.marketplace.topCities.map((c) => (
                <span
                  key={c.city}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-ink"
                >
                  {c.city} <span className="tabular-nums text-muted">{c.count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ---- Revenue --------------------------------------------------- */}
      <Card padding="lg">
        <SectionHead
          icon={<IndianRupee className="size-4" />}
          title="Paisa"
          note="MRR live subscriptions × aaj ke plan daam se banta hai — store nahi hota, isliye /admin/pricing par daam badalte hi sach reh jaata hai."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Window mein aaya (asli)" value={paiseToRupeeDisplay(snap.revenue.capturedPaise)} sub={`${snap.revenue.capturedCount} payments`} />
          <Stat label="ARPU" value={paiseToRupeeDisplay(snap.revenue.arpuPaise)} sub="captured ÷ paying members" />
          <Stat label="Paid conversion" value={`${snap.revenue.paidConversionPct}%`} sub="is window ke signups mein se" />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-3 font-medium">Plan</th>
                <th className="pb-2 pr-3 font-medium">Members</th>
                <th className="pb-2 pr-3 font-medium">Price</th>
                <th className="pb-2 font-medium">MRR</th>
              </tr>
            </thead>
            <tbody>
              {snap.revenue.planMix.map((p) => (
                <tr key={p.code} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3 text-ink">{p.name}</td>
                  <td className="py-2 pr-3 tabular-nums text-ink">{p.subscribers}</td>
                  <td className="py-2 pr-3 tabular-nums text-muted">{paiseToRupeeDisplay(p.pricePaise)}</td>
                  <td className="py-2 tabular-nums text-ink">{paiseToRupeeDisplay(p.mrrPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Test gateway: {paiseToRupeeDisplay(snap.revenue.testPaise)} ({snap.revenue.testCount}{" "}
          payments) — asli kamai mein kabhi nahi juda. Refund{" "}
          {paiseToRupeeDisplay(snap.revenue.refundedPaise)}, {snap.revenue.failedCount} payment fail
          hue.
        </p>
      </Card>

      {/* ---- Partner channel -------------------------------------------- */}
      <Card padding="lg">
        <SectionHead
          icon={<Handshake className="size-4" />}
          title="Partner channel"
          note="Partner se aaye member vs khud aaye member — kaun zyada paisa deta hai."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Live partners" value={String(snap.partners.activePartners)} sub="APPROVED + ACTIVE" />
          <Stat
            label="Partner se signups"
            value={String(snap.partners.referredSignups)}
            sub={`${snap.partners.referredPaid} ne paisa diya`}
          />
          <Stat
            label="Khud aaye signups"
            value={String(snap.partners.organicSignups)}
            sub={`${snap.partners.organicPaid} ne paisa diya`}
          />
          <Stat
            label="Lift"
            value={snap.partners.liftPoints === null ? "—" : `${snap.partners.liftPoints > 0 ? "+" : ""}${snap.partners.liftPoints}pp`}
            sub={snap.partners.liftPoints === null ? "dono taraf 5+ signup chahiye" : "referred − organic"}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Commission: {paiseToRupeeDisplay(snap.partners.commissionOwedPaise)} baaki hai,{" "}
          {paiseToRupeeDisplay(snap.partners.commissionPaidPaise)} de diya.
        </p>
      </Card>

      {/* ---- AI usage ---------------------------------------------------- */}
      <Card padding="lg">
        <SectionHead
          icon={<Bot className="size-4" />}
          title="AI usage"
          note="Har feature ke tokens — kaunsa feature paisa kha raha hai, aur kahan quota/safety block lag raha hai."
        />
        {snap.ai.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Is window mein ek bhi AI call nahi hui.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-3 font-medium">Feature</th>
                  <th className="pb-2 pr-3 font-medium">Calls</th>
                  <th className="pb-2 pr-3 font-medium">In tokens</th>
                  <th className="pb-2 pr-3 font-medium">Out tokens</th>
                  <th className="pb-2 font-medium">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {snap.ai.map((r) => (
                  <tr key={r.feature} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3 text-ink">{r.feature}</td>
                    <td className="py-2 pr-3 tabular-nums text-ink">{r.calls}</td>
                    <td className="py-2 pr-3 tabular-nums text-muted">{r.inputTokens.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3 tabular-nums text-muted">{r.outputTokens.toLocaleString("en-IN")}</td>
                    <td className="py-2 tabular-nums text-muted">{r.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="pb-2 text-center text-xs text-muted">
        {new Date(snap.generatedAt).toLocaleString("en-IN")} tak ka data. Har number database ke
        rows ka count hai — koi estimate, koi projection nahi.
      </p>
    </div>
  );
}

// ============================================================

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function SectionHead({
  icon,
  title,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bg-subtle text-muted">
          {icon}
        </span>
        {title}
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{note}</p>
    </div>
  );
}

/** "—" for a week that has not finished yet — an unfinished week reads as a fake drop. */
function retCell(value: number | null, signups: number): string {
  if (value === null) return "—";
  if (signups === 0) return "0";
  return `${value} (${Math.round((value / signups) * 1000) / 10}%)`;
}
