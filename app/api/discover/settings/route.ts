import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import {
  getDiscoverySettings,
  saveDiscoverySettings,
  resetLearnedBehavior,
} from "@/lib/services/discovery/discoverySettingsService";
import {
  buildLearnedBehaviorProfile,
  countEligibleSwipes,
  summarizeBehaviorLearning,
} from "@/lib/services/discovery/behaviorLearning";

export const runtime = "nodejs";

/**
 * GET returns settings + the canonical partner-preference fields (so the
 * client can pre-fill the search form from the one source of truth, per the
 * brief — this route never duplicates them) + a behaviour-learning summary,
 * for every plan. PUT is gated: only an `advancedDiscovery` user may change a
 * setting that only means something on that plan. FREE can still *read* its
 * own (default) settings — that is the "useful preview" the brief asks for.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const [settings, profile, gate] = await Promise.all([
    getDiscoverySettings(user.id),
    prisma.profile.findUnique({ where: { userId: user.id }, include: PROFILE_FULL_INCLUDE }),
    isFeatureAvailable(user.id, "advancedDiscovery", (ctx) => ctx.features.advancedDiscovery),
  ]);

  let behavior = summarizeBehaviorLearning({ enabled: settings.behaviorLearningEnabled, profile: null, sampleSize: 0, positiveCount: 0 });
  if (gate.allowed) {
    const resetAt = settings.behaviorResetAt ? new Date(settings.behaviorResetAt) : null;
    const [learned, counts] = await Promise.all([
      settings.behaviorLearningEnabled ? buildLearnedBehaviorProfile(user.id) : Promise.resolve(null),
      countEligibleSwipes(user.id, resetAt),
    ]);
    behavior = summarizeBehaviorLearning({
      enabled: settings.behaviorLearningEnabled,
      profile: learned,
      sampleSize: counts.total,
      positiveCount: counts.positive,
    });
  }

  const prefs = profile?.partnerPreferences ?? null;

  return NextResponse.json({
    ok: true,
    entitled: gate.allowed,
    settings,
    behavior,
    partnerPreferences: prefs
      ? {
          lookingForGender: prefs.lookingForGender,
          minAge: prefs.minAge,
          maxAge: prefs.maxAge,
          preferredCities: prefs.preferredCities,
          educationPreference: prefs.educationPreference,
          maritalStatusPreference: prefs.maritalStatusPreference,
        }
      : null,
  });
}

const PatchSchema = z.union([
  z
    .object({
      filterMode: z.enum(["FLEXIBLE", "STRICT"]).optional(),
      verifiedOnly: z.boolean().optional(),
      minTrustScore: z.number().int().min(0).max(100).nullable().optional(),
      behaviorLearningEnabled: z.boolean().optional(),
    })
    .strict(),
  z.object({ action: z.literal("resetLearnedBehavior") }).strict(),
]);

export async function PUT(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const gate = await isFeatureAvailable(user.id, "advancedDiscovery", (ctx) => ctx.features.advancedDiscovery);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, code: "plan", message: "Advanced Discovery abhi aapke plan me available nahi hai." },
      { status: 403 },
    );
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Value valid nahi hai." },
      { status: 422 },
    );
  }

  if ("action" in parsed.data) {
    await resetLearnedBehavior(user.id);
    return NextResponse.json({ ok: true, settings: await getDiscoverySettings(user.id) });
  }

  const settings = await saveDiscoverySettings(user.id, parsed.data);
  return NextResponse.json({ ok: true, settings });
}
