"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Rocket, Sparkles } from "lucide-react";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import type { ConnectionStatusRow, MarketingOverview, MarketingProviderKey } from "@/lib/contracts/marketingAi";
import { MARKETING_PROVIDER_META } from "@/lib/contracts/marketingAi";
import { ACTIVE_DEPLOYMENT_STATUSES } from "@/lib/contracts/marketingExecution";
import CommandBox from "./CommandBox";
import ConnectionStrip from "./ConnectionStrip";
import ConnectionSheet from "./ConnectionSheet";
import WorkQueue from "./WorkQueue";
import TaskDetailSheet from "./TaskDetailSheet";

/**
 * The control room (§2): three permanent zones, one route, drawers for
 * detail. State is the overview the server rendered; while any task is
 * WORKING the console polls `/api/admin/marketing-ai/overview` so the
 * queue moves without a reload, and stops polling the moment nothing is.
 */
export default function MarketingAiConsole({
  initial,
  connectResult,
  connectProvider,
}: {
  initial: MarketingOverview;
  connectResult: string | null;
  connectProvider: string | null;
}) {
  const [overview, setOverview] = useState(initial);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [openConnection, setOpenConnection] = useState<MarketingProviderKey | null>(null);
  const { toast } = useToast();
  const announced = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing-ai/overview", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.ok) setOverview(json.overview as MarketingOverview);
    } catch {
      /* next tick */
    }
  }, []);

  // Poll only while something is running — a planning run or a deployment
  // worker — 4s is quick enough to feel live and slow enough that a 3-minute
  // model call costs ~45 cheap reads.
  const working = overview.tasks.some((t) => t.status === "WORKING" || t.deployments.some((d) => ACTIVE_DEPLOYMENT_STATUSES.has(d.status)));
  useEffect(() => {
    if (!working) return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [working, refresh]);

  // The Google OAuth callback lands here with ?connect=… — say what happened once.
  useEffect(() => {
    if (!connectResult || announced.current) return;
    announced.current = true;
    const label = connectProvider && connectProvider in MARKETING_PROVIDER_META ? MARKETING_PROVIDER_META[connectProvider as MarketingProviderKey].label : "Google";
    const messages: Record<string, { title: string; tone: "success" | "error" | "warning" }> = {
      ok: { title: `${label} authorise ho gaya`, tone: "success" },
      cancelled: { title: "Google authorisation cancel hui", tone: "warning" },
      failed: { title: `${label}: Google se token nahi mila`, tone: "error" },
      state: { title: "Authorisation verify nahi hui — dobara Connect karein", tone: "error" },
      store_failed: { title: "Grant store nahi hua — SECRETS_ENCRYPTION_KEY dekhein", tone: "error" },
      google_unavailable: { title: "GOOGLE_CLIENT_ID/SECRET set nahi hain", tone: "error" },
      invalid_provider: { title: "Galat provider", tone: "error" },
    };
    const m = messages[connectResult];
    if (m) toast({ title: m.title, tone: m.tone });
    if (connectResult === "ok" && connectProvider && connectProvider in MARKETING_PROVIDER_META) {
      setOpenConnection(connectProvider as MarketingProviderKey);
    }
    // Drop the query so a reload does not re-announce.
    window.history.replaceState(null, "", "/admin/marketing-ai");
  }, [connectResult, connectProvider, toast]);

  const connectionRow: ConnectionStatusRow | null = openConnection ? (overview.connections.find((c) => c.provider === openConnection) ?? null) : null;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-wine-700">
            <Rocket className="size-6" aria-hidden />
            Growth Saathi
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Ek goal dijiye — Growth Saathi BandhanTak, Google aur Meta ka asli data padh kar poora campaign package banata hai: strategy,
            Google Search, Meta, Reels/Stories aur landing copy. Platform par kuch bhi tabhi hota hai jab aap approve karein — Google Search
            campaign pehle PAUSED banta hai (koi spend nahi), aur live sirf ek alag activation approval se hota hai.
          </p>
        </div>
        <Link href="/admin/ai-settings" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
          <Sparkles className="size-3.5" aria-hidden />
          <Pill tone="neutral" size="sm">
            {overview.aiRoute.provider.toLowerCase()} · {overview.aiRoute.model}
          </Pill>
        </Link>
      </section>

      {/* Zone A — command + conversation */}
      <CommandBox disabled={working} onSubmitted={refresh} />

      {/* Zone C — account health strip. Above the queue on purpose: what the
          AI can read decides how good the next plan is, and the strip says
          so before the command is typed. */}
      <ConnectionStrip rows={overview.connections} onOpen={(p) => setOpenConnection(p)} />

      {/* Zone B — the work queue */}
      <WorkQueue tasks={overview.tasks} onOpen={(id) => setOpenTaskId(id)} onChanged={refresh} />

      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} onChanged={refresh} />

      <ConnectionSheet
        row={connectionRow}
        encryptionConfigured={overview.encryptionConfigured}
        googleOAuthConfigured={overview.googleOAuthConfigured}
        onClose={() => setOpenConnection(null)}
        onChanged={refresh}
      />
    </div>
  );
}
