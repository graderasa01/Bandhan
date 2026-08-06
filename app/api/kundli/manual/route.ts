import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { generateManualKundli, ManualKundliInput } from "@/lib/services/kundli/manualKundliService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: "Login chahiye." }, { status: 401 });

  const parsed = ManualKundliInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Form sahi se bharein." },
      { status: 422 },
    );
  }

  const result = await generateManualKundli(user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: result.code === "LOCKED" ? 403 : 422 },
    );
  }

  return NextResponse.json({ ok: true, chart: result.chart, usedCredit: result.usedCredit });
}
