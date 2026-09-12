import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { generateManualKundli, ManualKundliInput } from "@/lib/services/kundli/manualKundliService";
import { getT } from "@/lib/i18n/server";

/**
 * "Turant Kundli Banayen" — the paid manual tool.
 *
 * Everything the client sends is re-validated here and re-decided in
 * `generateManualKundli`: the plan/credit gate, the date, whether a missing
 * birth time was *chosen* (`birthTimeUnknown`) or simply left blank, and
 * whether the typed place resolves to exactly one real place. The component
 * only decides which UI to draw.
 *
 * Three of the failure codes are conversations, not errors, and each keeps
 * its own shape so the form can answer it:
 *   - `PLACE_AMBIGUOUS` carries `candidates` — the person picks one and the
 *     pick comes back as `placeChoice`.
 *   - `PLACE_UNRESOLVED` carries `reason` — spelling, or a lookup that is
 *     down. Never a default city.
 *   - `INVALID` carries `field`, so the form can point at it.
 *
 * Nothing is persisted (see the header of `manualKundliService.ts`), so the
 * chart, its subject and the Astro-AI reading all travel back in this
 * response — there is no id to fetch them by later.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: "Login chahiye." }, { status: 401 });

  const parsed = ManualKundliInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID", message: parsed.error.issues[0]?.message ?? "Form sahi se bharein." },
      { status: 422 },
    );
  }

  const t = await getT();
  const result = await generateManualKundli(user.id, parsed.data, t);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.code === "PLACE_AMBIGUOUS" ? { candidates: result.candidates } : {}),
        ...(result.code === "PLACE_UNRESOLVED" ? { reason: result.reason } : {}),
        ...(result.code === "INVALID" && result.field ? { field: result.field } : {}),
      },
      { status: result.code === "LOCKED" ? 403 : 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    chart: result.chart,
    subject: result.subject,
    interpretation: result.interpretation,
    usedCredit: result.usedCredit,
  });
}
