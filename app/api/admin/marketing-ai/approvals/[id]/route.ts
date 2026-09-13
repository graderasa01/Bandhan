import { NextResponse, after } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { decideApproval } from "@/lib/services/marketing/approvalService";
import { runDeployment } from "@/lib/services/marketing/execution/deploymentWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The provider write runs after the response via `after()`; this bounds the whole handler. */
export const maxDuration = 300;

const Schema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * One decision on one card. "Approve campaign package", "Create paused on
 * Google" and "Activate Google campaign" are separate actions with separate
 * cards (§10, doc 13 §4) — this route never takes an action name, only a
 * decision on the card it is addressed to.
 *
 * For a write card the response says `QUEUED` with the deployment's state;
 * it never claims the provider write completed (doc 13 §19). The worker
 * starts after the response and the sheet polls the task for the truth.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { id } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = Schema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Input valid nahi hai." }, { status: 422 });
  }
  if (parsed.data.decision === "REJECT" && !parsed.data.reason) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Reject ka reason likhiye — Growth Saathi agli baar usse seekhta hai." }, { status: 422 });
  }

  const result = await decideApproval({
    approvalId: id,
    decision: parsed.data.decision,
    reason: parsed.data.reason ?? null,
    actorId: user.id,
    actorRole: user.role,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });

  if (result.status === "QUEUED" && result.deploymentId && (result.deploymentStatus === "QUEUED" || result.deploymentStatus === "ACTIVATION_QUEUED")) {
    const deploymentId = result.deploymentId;
    after(async () => {
      try {
        await runDeployment(deploymentId, { workerId: `after-${user.id.slice(0, 8)}` });
      } catch (err) {
        console.error("[marketing:deployment] after() run failed:", err instanceof Error ? err.message : String(err));
      }
    });
  }

  return NextResponse.json({ ok: true, status: result.status, deploymentId: result.deploymentId ?? null, deploymentStatus: result.deploymentStatus ?? null }, { status: result.status === "QUEUED" ? 202 : 200 });
}
