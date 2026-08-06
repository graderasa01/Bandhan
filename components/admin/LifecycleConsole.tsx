"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, Clock, Eye, Send, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import {
  SKIP_LABELS,
  TIER_LABELS,
  type LifecycleRunSummary,
  type LifecycleTier,
  type SkipReason,
} from "@/lib/contracts/lifecycle";
import { cn } from "@/lib/utils";

/**
 * The preview *is* the feature.
 *
 * An automated job that messages real families is only safe if the person who
 * turns it on has already read, word for word, what it will say and to whom.
 * So this page opens on a dry run — every query, every ranking, every brake,
 * zero rows written — and "Send Now" is deliberately the second thing you can
 * do here, behind a confirm, never the first.
 */
export default function LifecycleConsole({ initial }: { initial: LifecycleRunSummary }) {
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  async function run(mode: "preview" | "send") {
    setBusy(mode);
    try {
      const res = await fetch("/api/admin/lifecycle", {
        method: mode === "send" ? "POST" : "GET",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message ?? "Run nahi hua");
      const next = data.summary as LifecycleRunSummary;
      setSummary(next);
      toast({
        title: mode === "send" ? `${next.sent} nudge bhej diye` : "Preview refresh ho gaya",
        description:
          mode === "send" && !next.withinSendWindow
            ? "Abhi quiet hours hain (9pm–9am IST) — kuchh nahi gaya, sab rok diya gaya."
            : undefined,
        tone: mode === "send" && !next.withinSendWindow ? "warning" : "success",
      });
    } catch (err) {
      toast({
        title: "Lifecycle run fail hua",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setBusy(null);
      setConfirmOpen(false);
    }
  }

  const skipRows = (Object.entries(summary.skipped) as [SkipReason, number][]).filter(
    ([, n]) => n > 0,
  );

  return (
    <div className="space-y-6">
      {/* ---- Controls ------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => run("preview")}
          disabled={busy !== null}
          icon={<Eye className="size-4" />}
        >
          {busy === "preview" ? "Chal raha hai…" : "Refresh Preview"}
        </Button>
        <Button
          variant="primary"
          onClick={() => setConfirmOpen(true)}
          disabled={busy !== null || summary.selected === 0}
          icon={<Send className="size-4" />}
        >
          Send Now
        </Button>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            summary.withinSendWindow ? "bg-trust/10 text-trust" : "bg-warn-bg text-warn",
          )}
        >
          <Clock className="size-3.5" />
          {summary.withinSendWindow ? "Send window khula hai" : "Quiet hours — abhi kuchh nahi jaayega"}
        </span>
      </div>

      {/* ---- Headline ------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Campaign ne dhoonde" value={String(summary.candidates)} sub="distinct users" />
        <Stat
          label="Bhejne layak"
          value={String(summary.selected)}
          sub="saare brake paar karne ke baad"
        />
        <Stat
          label="Roke gaye"
          value={String(summary.candidates - summary.selected)}
          sub="niche wajah dekhiye"
        />
        <Stat
          label="Pichhle run mein gaye"
          value={String(summary.sent)}
          sub={summary.dryRun ? "ye dry run tha" : "asli send"}
        />
      </div>

      {/* ---- What would go out ---------------------------------------- */}
      <Card padding="lg" variant="luxe">
        <SectionHead
          icon={<BellRing className="size-4" />}
          title="Abhi ye jaayega — shabd ba shabd"
          note="Har line wahi hai jo user ke phone par dikhegi. Koi alag 'push copy' nahi hai — inbox aur lock screen dono yahi padhte hain."
        />
        {summary.preview.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Abhi kisi ko bhejne layak kuchh nahi hai. Ye normal hai — engine jaan-boojh kar kam
            bhejta hai.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {summary.preview.map((n, i) => (
              <div key={`${n.userId}-${i}`} className="rounded-md border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <TierPill tier={n.tier} />
                  <span className="text-xs text-muted">{n.campaignLabel}</span>
                  <span className="ml-auto truncate text-xs text-muted">{n.userName}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{n.title}</p>
                <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                <p className="mt-1 font-mono text-xs text-muted">{n.href}</p>
              </div>
            ))}
            {summary.selected > summary.preview.length && (
              <p className="pt-1 text-xs text-muted">
                …aur {summary.selected - summary.preview.length} aur.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ---- Campaigns ------------------------------------------------ */}
      <Card padding="lg">
        <SectionHead
          icon={<ShieldCheck className="size-4" />}
          title="Campaign-wise"
          note="'Mile' matlab campaign ki apni query ne kitne log dhoonde. Ek user ko sirf ek hi nudge jaata hai — sabse upar wale tier wala jeetta hai, baaki chup rehte hain."
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-3 font-medium">Campaign</th>
                <th className="pb-2 pr-3 font-medium">Tier</th>
                <th className="pb-2 pr-3 font-medium">Mile</th>
                <th className="pb-2 pr-3 font-medium">Roke gaye</th>
                <th className="pb-2 font-medium">Gaye</th>
              </tr>
            </thead>
            <tbody>
              {summary.campaigns.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3 text-ink">{c.label}</td>
                  <td className="py-2 pr-3">
                    <TierPill tier={c.tier} />
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-ink">{c.matched}</td>
                  <td className="py-2 pr-3 tabular-nums text-muted">{c.skipped}</td>
                  <td className="py-2 tabular-nums text-ink">{c.sent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---- Brakes --------------------------------------------------- */}
      <Card padding="lg">
        <SectionHead
          icon={<AlertTriangle className="size-4" />}
          title="Kaun kaun roka gaya, aur kyun"
          note="Ye engine ka sabse zaroori hissa hai. Automated messaging ka khatra 'kam bheja' nahi hota — khatra ye hota ki log notification band kar dein, aur wo wapas nahi milta."
        />
        {skipRows.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Is run mein kisi ko roka nahi gaya.</p>
        ) : (
          <div className="mt-4 space-y-1.5">
            {skipRows.map(([reason, n]) => (
              <div key={reason} className="flex items-center gap-3 rounded-md border border-line p-2.5">
                <span className="w-12 shrink-0 text-right text-lg font-bold tabular-nums text-wine-700">
                  {n}
                </span>
                <span className="text-sm text-ink">{SKIP_LABELS[reason]}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="pb-2 text-center text-xs text-muted">
        {new Date(summary.ranAt).toLocaleString("en-IN")} — {summary.dryRun ? "dry run" : "asli run"}.
        Cron ke liye: <code className="font-mono">POST /api/cron/lifecycle</code> (CRON_SECRET
        zaroori), din mein do baar.
      </p>

      <AdminActionConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => run("send")}
        title="Nudges abhi bhejein?"
        description="Ye asli notifications hain — inbox mein row banegi aur jinhone push allow kiya hai unke phone par notification jaayegi. Wapas nahi liya ja sakta."
        details={[
          { label: "Kitne logon ko", value: String(summary.selected) },
          { label: "Send window", value: summary.withinSendWindow ? "Khula" : "Band (quiet hours)" },
          { label: "Sabse bada campaign", value: topCampaign(summary) },
        ]}
        confirmLabel={busy === "send" ? "Bhej raha hoon…" : "Haan, bhejein"}
        variant="warning"
        auditNote="Ye run audit log mein save hoga — kisne chalaya aur kitne gaye."
      />
    </div>
  );
}

// ============================================================

function topCampaign(s: LifecycleRunSummary): string {
  const best = [...s.campaigns].sort((a, b) => b.matched - a.matched)[0];
  return best && best.matched > 0 ? `${best.label} (${best.matched})` : "—";
}

const TIER_TONE: Record<LifecycleTier, string> = {
  1: "bg-wine-100 text-wine-700 dark:bg-wine-900/30 dark:text-wine-300",
  2: "bg-warn-bg text-warn",
  3: "bg-info-bg text-info",
  4: "bg-bg-subtle text-muted",
  5: "bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200",
};

function TierPill({ tier }: { tier: LifecycleTier }) {
  return (
    <span className={cn("rounded-sm px-2 py-0.5 text-[0.6875rem] font-medium", TIER_TONE[tier])}>
      {TIER_LABELS[tier]}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
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
