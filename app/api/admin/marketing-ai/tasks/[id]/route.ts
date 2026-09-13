import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getTaskDetail } from "@/lib/services/marketing/taskService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything about one task: plan, evidence the model read, drafts, creatives, approvals, runs. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { id } = await params;
  const task = await getTaskDetail(id);
  if (!task) return NextResponse.json({ error: "NOT_FOUND", message: "Task nahi mila." }, { status: 404 });
  return NextResponse.json({ ok: true, task });
}
