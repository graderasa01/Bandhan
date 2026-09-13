import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { DeploymentStatusKey, SafeExecutionError } from "@/lib/contracts/marketingExecution";
import type { GoogleAdsWriteProvider } from "@/lib/marketing/providers/googleAdsProvider";
import type { MetaAdsWriteProvider } from "@/lib/marketing/providers/metaAdsProvider";
import type { UrlProbeVerdict } from "@/lib/marketing/storage/marketingCreativeStorage";
import { ExecutionError } from "./executionErrors";
import { specHashOf } from "./hashing";
import type { Prisma } from "@prisma/client";

/**
 * What both platform executors share (doc 14 §17): the options a run is
 * driven by, the outcome it reports, and the small helpers every step uses.
 * Approval validation, leases, events and error normalisation are *not*
 * here — they live once in `deploymentService.ts` / `executionErrors.ts`.
 */

export interface WorkerOptions {
  /** Google Ads provider — injected by the checks; production builds it from the sealed grant. (MKT-2A name, kept.) */
  provider?: GoogleAdsWriteProvider;
  providerFactory?: () => Promise<GoogleAdsWriteProvider>;
  /** Meta provider — injected by the checks; production builds it from the Meta token + ad account. */
  metaProvider?: MetaAdsWriteProvider;
  metaProviderFactory?: () => Promise<MetaAdsWriteProvider>;
  workerId?: string;
  now?: () => Date;
  /** Landing-page reachability probe (doc 13 §10.11) — injectable so tests never hit the network. */
  probeLanding?: (url: string) => Promise<{ ok: boolean; status: number | null }>;
  /** Public creative URL probe (doc 14 §10) — injectable for the same reason. */
  probeUrl?: (url: string) => Promise<UrlProbeVerdict>;
  /** Reads a stored creative's bytes for the Meta image step — injectable for the checks. */
  readMedia?: (storageKey: string) => Promise<Buffer | null>;
}

export interface RunOutcome {
  ran: boolean;
  status: DeploymentStatusKey | null;
  error: SafeExecutionError | null;
  message: string;
}

export function outcome(ran: boolean, status: DeploymentStatusKey | null, message: string, error: SafeExecutionError | null = null): RunOutcome {
  return { ran, status, error, message };
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function defaultProbeLanding(url: string): Promise<{ ok: boolean; status: number | null }> {
  const attempt = async (method: "HEAD" | "GET") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: controller.signal, headers: { "user-agent": "BandhanTak-GrowthSaathi/1.0 (landing check)" } });
      return { ok: res.status >= 200 && res.status < 400, status: res.status };
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const head = await attempt("HEAD");
    if (head.ok || (head.status !== null && head.status !== 405 && head.status !== 403)) return head;
    return await attempt("GET");
  } catch {
    return { ok: false, status: null };
  }
}

/** The draft's spec hash as it is *now* — re-read before every provider write. */
export async function currentSpecHash(draftId: string): Promise<string> {
  const draft = await prisma.campaignDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new ExecutionError("SPEC_CHANGED", "Draft delete ho gaya.");
  return specHashOf({ platform: draft.platform, spec: draft.spec, dailyBudgetPaise: draft.dailyBudgetPaise, totalBudgetPaise: draft.totalBudgetPaise });
}
