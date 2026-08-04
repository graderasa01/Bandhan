import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { toUserDto } from "@/lib/auth/dto";
import type { ApiErrorResponse } from "@/lib/contracts/auth";

export const runtime = "nodejs";

const LoginSchema = z.object({
  mobile_or_email: z.string().trim().min(1, "Mobile ya email daaliye."),
  password: z.string().min(1, "Password daaliye."),
  remember_me: z.boolean().optional(),
});

function bad(error: string, message: string, status: number) {
  return NextResponse.json({ error, message } satisfies ApiErrorResponse, { status });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("BAD_REQUEST", "Request JSON padha nahi ja saka.", 400);
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return bad("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Form sahi se bharein.", 422);
  }
  const { mobile_or_email, password, remember_me } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ mobile: mobile_or_email }, { email: mobile_or_email }], deletedAt: null },
  });

  // Same message whether the account doesn't exist or the password is wrong —
  // distinguishing the two just tells an attacker which mobiles/emails are real.
  if (!user) {
    return bad("INVALID_CREDENTIALS", "Mobile/email ya password galat hai.", 401);
  }
  if (user.status === "BLOCKED" || user.status === "DELETED") {
    return bad("ACCOUNT_BLOCKED", "Ye account blocked hai. Support se sampark karein.", 403);
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return bad("INVALID_CREDENTIALS", "Mobile/email ya password galat hai.", 401);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await createSession({
    userId: user.id,
    role: user.role,
    status: user.status,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
    rememberMe: remember_me,
  });

  console.info(`[auth:login] user=${user.id}`);

  return NextResponse.json({ user: toUserDto(user) });
}
