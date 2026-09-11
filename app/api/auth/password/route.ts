import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { parseJsonBody } from "@/app/api/_shared/responses";

export const runtime = "nodejs";

const PasswordSchema = z.object({
  current_password: z.string().optional(),
  new_password: z.string().min(8, "Naya password kam se kam 8 characters ka hona chahiye."),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED", message: "Pehle login karein." }, { status: 401 });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = PasswordSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Form sahi se bharein." },
      { status: 422 },
    );
  }

  if (user.passwordHash) {
    const current = parsed.data.current_password ?? "";
    if (!(await verifyPassword(current, user.passwordHash))) {
      return NextResponse.json(
        { error: "INVALID_PASSWORD", message: "Purana password sahi nahi hai." },
        { status: 401 },
      );
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.new_password) },
  });

  console.info(`[auth:password] changed user=${user.id}`);
  return NextResponse.json({ ok: true });
}
