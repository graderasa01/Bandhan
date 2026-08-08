import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/postLoginPath";
import { toUserDto } from "@/lib/auth/dto";
import { parseJsonBody } from "@/app/api/_shared/responses";
import type { ApiErrorResponse } from "@/lib/contracts/auth";

export const runtime = "nodejs";

const LoginSchema = z.object({
  mobile_or_email: z.string().trim().min(1, "Mobile ya email daaliye."),
  password: z.string().min(1, "Password daaliye."),
  remember_me: z.boolean().optional(),
  // Which door this request came through — the public member form vs the
  // unlisted /admin/login. Enforced below, not just picked by the client, so
  // an admin account can never end up with a session started from the public
  // form (and vice versa) no matter what the frontend does.
  portal: z.enum(["member", "admin"]).optional().default("member"),
});

function bad(error: string, message: string, status: number) {
  return NextResponse.json({ error, message } satisfies ApiErrorResponse, { status });
}

export async function POST(req: Request) {
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = LoginSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return bad("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Form sahi se bharein.", 422);
  }
  const { mobile_or_email, password, remember_me, portal } = parsed.data;

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
  // Separate message from BLOCKED because it is a separate admin decision with
  // a separate remedy — a suspension is meant to be appealed, not final.
  if (user.status === "SUSPENDED") {
    return bad("ACCOUNT_SUSPENDED", "Ye account abhi suspended hai. Support se sampark karein.", 403);
  }

  // A Google-created account has no password hash at all. It gets the same
  // generic message as a wrong password — telling the user "ye account Google
  // se bana hai" would also tell an attacker probing addresses which ones are
  // Google accounts, and which are worth phishing rather than guessing.
  if (!user.passwordHash) {
    return bad("INVALID_CREDENTIALS", "Mobile/email ya password galat hai.", 401);
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return bad("INVALID_CREDENTIALS", "Mobile/email ya password galat hai.", 401);
  }

  // Portal separation — checked only after the password is confirmed correct,
  // so a wrong-password guess on either form still gets the generic message
  // above rather than confirming an account's role.
  const isAdminAccount = user.role === "ADMIN" || user.role === "SUPPORT";
  if (portal === "admin" && !isAdminAccount) {
    return bad("NOT_ADMIN", "Ye account admin panel ke liye authorized nahi hai.", 403);
  }
  if (portal === "member" && isAdminAccount) {
    return bad("USE_ADMIN_LOGIN", "Admin/support login /admin/login se karein.", 403);
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

  // Resolved here rather than guessed by the form. A PARTNER's destination
  // depends on `Partner.status`, which the client has no way to read, and the
  // old client-side guess (always /user/dashboard) is exactly what dropped
  // partners onto the public homepage via middleware's role bounce.
  const landing = await postLoginPath(user);

  return NextResponse.json({ user: toUserDto(user), landing });
}
