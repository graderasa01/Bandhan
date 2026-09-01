import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { resolveDraftAccess, saveManagedFields } from "@/lib/services/managedProfile/managedDraftService";
import { resolveCreatorContext } from "@/lib/services/managedProfile/managedEligibility";

export const runtime = "nodejs";

const FieldSchema = z.object({
  value: z.string().max(2000),
  // The three client words, exactly as `/api/profile/save-draft` accepts them.
  // Anything else — including a real `SignalSource` name — falls through to
  // USER_ENTERED in `resolveContributionSource`; there is deliberately no way
  // to spell PARTNER_ENTERED from here.
  source: z.enum(["user", "ai", "inferred"]).optional(),
  sourceContext: z.string().max(500).optional(),
  confidence: z.number().optional(),
});

const BodySchema = z.object({
  fields: z.record(z.string(), FieldSchema),
});

/**
 * The managed draft's autosave — the managed twin of
 * `/api/profile/save-draft`, and pointedly not a wrapper around it.
 *
 * Three separate re-authorisations happen on every single tap, none of them
 * cached from the last one:
 *
 *  1. Who is signed in (`requireUser`).
 *  2. May they touch *this* draft at all, and is their access still live
 *     (`resolveDraftAccess` — which re-reads the delegation, so a revoke
 *     lands on the very next keystroke).
 *  3. Are they still an eligible creator (`resolveCreatorContext` — a partner
 *     suspended mid-session stops being able to write here immediately,
 *     rather than at their next login).
 */
export async function POST(req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { draftId } = await params;
  const access = await resolveDraftAccess(user.id, draftId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
  }

  if (!access.access.canWriteValues) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: access.access.draft.claimedByUserId
          ? "Ab is profile me badlav ke liye owner ki permission chahiye."
          : "Is draft me abhi badlav nahi ho sakta.",
      },
      { status: 403 },
    );
  }

  const contextResult = await resolveCreatorContext(user);
  if (!contextResult.ok) {
    return NextResponse.json(
      { error: contextResult.block, message: contextResult.message, ctaHref: contextResult.ctaHref },
      { status: contextResult.status },
    );
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Fields ka format galat hai." }, { status: 422 });
  }

  const result = await saveManagedFields(draftId, user.id, parsed.data.fields);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ written: result.written, ignored: result.ignored, version: result.version });
}
