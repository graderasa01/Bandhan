import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFamilyMember } from "@/lib/auth/requireFamilyMember";
import {
  getFamilyQuestionnaire,
  saveFamilyExpectation,
} from "@/lib/services/family/familyExpectationService";

export const runtime = "nodejs";

/**
 * The family's own expectations — read and write, scoped to the calling member.
 *
 * ## The boundary this route does not have
 *
 * There is no shape of this endpoint that returns the *owner's* answers. That
 * absence is the design, not an omission to be filled in later: over half the
 * questions here are MATCH_PRIVATE (children, parent care, family involvement),
 * and a parent reading their adult child's private answers is a worse violation
 * than a stranger doing it — the child cannot easily refuse, and refusing has a
 * cost at home that the app cannot see.
 *
 * So the family states its own view into the dark, the owner sees both sides,
 * and Grio talks to the owner about the difference. Nothing flows back down.
 *
 * The same rule the portal already applies to chat (`familySession.ts`: a
 * family cookie cannot present at the chat routes at all), applied to answers.
 */

const BodySchema = z.object({
  key: z.string().min(1),
  /** string | string[] — validated against the catalog's option list in the service. */
  value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
});

export async function GET() {
  const { member, response } = await requireFamilyMember();
  if (!member) return response;

  return NextResponse.json({ ok: true, questions: await getFamilyQuestionnaire(member) });
}

export async function POST(req: Request) {
  const { member, response } = await requireFamilyMember();
  if (!member) return response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const result = await saveFamilyExpectation(member, parsed.data.key, parsed.data.value);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  // The refreshed questionnaire rides back so the panel does not need a second
  // request to show the tick — the same contract the memory endpoint uses.
  return NextResponse.json({ ok: true, questions: await getFamilyQuestionnaire(member) });
}
