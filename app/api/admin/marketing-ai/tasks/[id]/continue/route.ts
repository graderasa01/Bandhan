import { NextResponse, after } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { continueTask, runTask } from "@/lib/services/marketing/taskService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Schema = z
  .object({
    kind: z.enum(["answer", "revise"]),
    text: z.string().trim().min(1, "Kuch likhiye.").max(2000),
  })
  .strict();

/**
 * Two verbs on one task: `answer` (the model asked one question; here is
 * the reply) and `revise` (the admin wants the package changed). Both
 * append to the thread, expire the pending approval and start a new run.
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

  const result = await continueTask({ taskId: id, text: parsed.data.text, kind: parsed.data.kind, actorId: user.id, actorRole: user.role });
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });

  after(async () => {
    await runTask(result.taskId, { id: user.id, role: user.role });
  });

  return NextResponse.json({ ok: true, taskId: result.taskId }, { status: 202 });
}
