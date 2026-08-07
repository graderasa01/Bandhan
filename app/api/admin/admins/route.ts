import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { createAdminAccount } from "@/lib/services/admin/adminAccountService";

export const runtime = "nodejs";

const CreateSchema = z.object({
  full_name: z.string().trim().min(2, "Naam kam se kam 2 characters ka hona chahiye."),
  email: z.string().trim().email("Valid email daaliye."),
  password: z.string().min(8, "Password kam se kam 8 characters ka hona chahiye."),
  role: z.enum(["ADMIN", "SUPPORT"]),
});

/**
 * Creates a new panel account (ADMIN or SUPPORT). `requireAdmin` — not
 * SUPPORT — same bar as the status changes in userAdminService.ts, because
 * handing out panel access is at least as consequential as taking it away.
 */
export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = CreateSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Galat input." },
      { status: 400 },
    );
  }

  const result = await createAdminAccount({
    actorId: user.id,
    fullName: parsed.data.full_name,
    email: parsed.data.email,
    password: parsed.data.password,
    role: parsed.data.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "REJECTED", message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, id: result.id });
}
