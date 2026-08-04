import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { listPolls, createPoll } from "@/lib/services/admin/pollAdminService";
import { PollTheme } from "@prisma/client";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  return NextResponse.json({ ok: true, polls: await listPolls() });
}

const CreateSchema = z.object({
  theme: z.nativeEnum(PollTheme),
  question: z.string().min(10).max(300),
  options: z.array(z.string().min(1).max(120)).min(2).max(4),
});

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const result = await createPoll({
    theme: parsed.data.theme,
    question: parsed.data.question,
    options: parsed.data.options,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true, poll: result.poll });
}
