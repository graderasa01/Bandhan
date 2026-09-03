import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  getMemberReferralConfig,
  setMemberReferralConfig,
} from "@/lib/services/referral/memberReferralConfig";

export const runtime = "nodejs";

/**
 * `.partial()` rather than all-required: the console saves one control at a
 * time, and `setMemberReferralConfig` validates each field on its own terms so
 * a single-field edit can never leave the program in a shape that pays for
 * nothing.
 *
 * Ranges are deliberately *not* duplicated here — only shapes. The service
 * owns the numbers, so the admin form and any future caller get the same
 * answer and the same Hinglish message.
 */
const PatchSchema = z
  .object({
    enabled: z.boolean(),
    rewardPlanCode: z.string().trim().min(1),
    rewardDays: z.number().int(),
    referralsPerReward: z.number().int(),
    maxRewardsPerUser: z.number().int(),
    requireJoinerPhoto: z.boolean(),
    joinerMinCompletionPercent: z.number().int(),
    requireJoinerVerifiedContact: z.boolean(),
    requireReferrerProfileComplete: z.boolean(),
    requireReferrerPhoto: z.boolean(),
    oneQualifiedPerDevice: z.boolean(),
    joinerRewardPlanCode: z.string().trim().min(1),
    joinerRewardDays: z.number().int(),
    shareMessage: z.string(),
  })
  .partial();

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Value valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await setMemberReferralConfig(parsed.data, {
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, config: await getMemberReferralConfig() });
}
