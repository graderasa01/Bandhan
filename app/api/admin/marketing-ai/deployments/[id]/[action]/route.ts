import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { recheckDeployment, requestActivation, retryDeployment, syncDeployment } from "@/lib/services/marketing/execution/deploymentWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ACTIONS = new Set(["sync", "retry", "recheck", "request-activation"]);

/**
 * The four admin verbs on one deployment (doc 13 §8, §14):
 *
 *   sync                — provider read-back / reconciliation by marker. Reads only.
 *   retry               — re-queue under the still-valid approval; the worker
 *                         searches by marker before it writes.
 *   recheck             — run readiness again and (re)issue the paused-create
 *                         card. Only before anything external exists.
 *   request-activation  — fresh read-back, then the activation card.
 *
 * POST only, admin only. None of these is reachable without a session, and
 * none of them ever performs a provider write inside the request except
 * `retry`, which runs the same guarded worker the approval path runs.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { id, action } = await params;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "NOT_FOUND", message: "Aisa koi action nahi hai." }, { status: 404 });
  const actor = { id: user.id, role: user.role };
  const workerId = `admin-${user.id.slice(0, 8)}`;

  try {
    if (action === "sync") {
      const r = await syncDeployment(id, { workerId });
      return NextResponse.json({ ok: r.ran, status: r.status, message: r.message, error: r.error }, { status: r.ran ? 200 : 409 });
    }
    const r = action === "retry" ? await retryDeployment(id, actor, { workerId }) : action === "recheck" ? await recheckDeployment(id, actor, { workerId }) : await requestActivation(id, actor, { workerId });
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.httpStatus });
    return NextResponse.json({ ok: true, status: r.status, message: r.message, error: r.run?.error ?? null });
  } catch (err) {
    console.error(`[marketing:deployment] ${action} failed:`, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "INTERNAL", message: "Action fail hua — deployment ka state dobara dekhein." }, { status: 500 });
  }
}
