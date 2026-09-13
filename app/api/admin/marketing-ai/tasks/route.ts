import { NextResponse, after } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { AUDIENCE_SIDES, CONVERSION_EVENTS, MARKETING_CHANNELS } from "@/lib/contracts/marketingAi";
import { createTask, listTasks, runTask } from "@/lib/services/marketing/taskService";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The run itself continues after the response via `after()`; this bounds the whole handler. */
export const maxDuration = 300;

const GoalSchema = z
  .object({
    geography: z.string().trim().max(120).optional(),
    audienceSide: z.enum(AUDIENCE_SIDES).optional(),
    windowDays: z.number().int().min(1).max(365).optional(),
    primaryConversion: z.enum(CONVERSION_EVENTS).optional(),
    target: z.number().int().min(1).max(1_000_000).optional(),
    dailyBudgetRupees: z.number().min(1).max(10_000_000).optional(),
    totalBudgetRupees: z.number().min(1).max(100_000_000).optional(),
    channels: z.array(z.enum(MARKETING_CHANNELS)).max(MARKETING_CHANNELS.length).optional(),
    constraints: z.string().trim().max(1000).optional(),
    stopLossRule: z.string().trim().max(300).optional(),
  })
  .strict();

const CommandSchema = z
  .object({
    request: z.string().trim().min(8, "Thoda aur likhiye — Growth Saathi ko goal samajhna hai.").max(4000),
    goal: GoalSchema.optional(),
    goalId: z.string().uuid().optional(),
  })
  .strict();

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  return NextResponse.json({ ok: true, tasks: await listTasks() });
}

/**
 * Zone A's submit. Creates the task, answers immediately, and runs the
 * plan after the response has been sent — the queue shows it as WORKING
 * until the run lands. Nothing external is touched at any point.
 */
export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = CommandSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Command valid nahi hai." },
      { status: 422 },
    );
  }

  // One planning run at a time: a second WORKING task would double the
  // provider reads and the model spend for no better plan.
  const working = await prisma.marketingTask.count({ where: { status: "WORKING" } });
  if (working > 0) {
    return NextResponse.json(
      { error: "BUSY", message: "Ek task abhi chal raha hai — uske poora hone ke baad naya dijiye." },
      { status: 409 },
    );
  }

  if (parsed.data.goalId) {
    const goal = await prisma.marketingGoal.findUnique({ where: { id: parsed.data.goalId }, select: { id: true } });
    if (!goal) return NextResponse.json({ error: "NOT_FOUND", message: "Goal nahi mila." }, { status: 404 });
  }

  const goalInput = parsed.data.goal && Object.keys(parsed.data.goal).length ? parsed.data.goal : null;
  const task = await createTask({ request: parsed.data.request, goalInput, goalId: parsed.data.goalId ?? null, actorId: user.id });

  await prisma.adminAuditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.role,
      actionType: "MARKETING_TASK_CREATED",
      targetType: "marketing_task",
      targetId: task.id,
      newValue: parsed.data.request.slice(0, 500),
    },
  });

  after(async () => {
    await runTask(task.id, { id: user.id, role: user.role });
  });

  return NextResponse.json({ ok: true, taskId: task.id }, { status: 202 });
}
