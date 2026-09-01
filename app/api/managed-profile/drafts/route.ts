import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { resolveCreatorContext } from "@/lib/services/managedProfile/managedEligibility";
import { createManagedDraft, listDraftsForCreator } from "@/lib/services/managedProfile/managedDraftService";

export const runtime = "nodejs";

const CreateSchema = z.object({
  display_label: z.string().trim().min(2).max(60),
  filling_for_gender: z.enum(["Ladka", "Ladki"]),
});

/** The creator's own drafts. Never anybody else's — the query is keyed by the
 *  session's user id, so there is no id a caller could substitute. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const drafts = await listDraftsForCreator(user.id);
  return NextResponse.json({ drafts });
}

/**
 * Start a private draft for somebody else.
 *
 * `creatorKind` and `partnerId` are **not** taken from the body — see
 * `resolveCreatorContext`. A body that named its own partner id would be the
 * whole authorisation model handed to the caller.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const contextResult = await resolveCreatorContext(user);
  if (!contextResult.ok) {
    return NextResponse.json(
      { error: contextResult.block, message: contextResult.message, ctaHref: contextResult.ctaHref },
      { status: contextResult.status },
    );
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = CreateSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: "Client ka naam aur Ladka/Ladki dono chahiye." },
      { status: 422 },
    );
  }

  const result = await createManagedDraft({
    creatorUserId: user.id,
    creatorLabel: contextResult.context.label,
    kind: contextResult.context.kind,
    partnerId: contextResult.context.partnerId,
    fillingForGender: parsed.data.filling_for_gender,
    displayLabel: parsed.data.display_label,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ draftId: result.draft.id }, { status: 201 });
}
