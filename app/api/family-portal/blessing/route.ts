import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFamilyMember } from "@/lib/auth/requireFamilyMember";
import { prisma } from "@/lib/db/prisma";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { permissionsFor } from "@/lib/services/family/familyConstants";
import { uploadAndModerateVoiceClip } from "@/lib/services/storage/voiceUpload";
import { mediaStorage } from "@/lib/services/storage/mediaStorage";
import { createNotice } from "@/lib/services/notice/noticeService";
import { celebrateFirst } from "@/lib/services/rewards/celebrationService";

export const runtime = "nodejs";

/**
 * Parent Voice Blessing — record (POST) and publish (PUT) are two calls for
 * the same reason `/api/media/voice` + a send endpoint are elsewhere: the
 * family member should be able to listen back before this goes on someone's
 * profile, not commit the instant the mic stops.
 *
 * The one hard rule this whole feature rests on: only a PARENT-relation
 * FamilyMember who bound their session through the owner's own invite link
 * may call either endpoint (`permissionsFor(...).canRecordBlessing`). That
 * invite/bind flow *is* the verification — see familyConstants.ts. Without
 * it this would just be an audio clip anyone could claim was a parent's.
 */

async function requireBlessingEligible() {
  const { member, response } = await requireFamilyMember();
  if (!member) return { member: null, response };

  if (!permissionsFor(member.relation).canRecordBlessing) {
    return {
      member: null,
      response: NextResponse.json(
        { error: "FORBIDDEN", message: "Sirf parent hi aashirwad record kar sakte hain." },
        { status: 403 },
      ),
    };
  }

  const gate = await isFeatureAvailable(member.ownerUserId, "parentBlessing");
  if (!gate.allowed) {
    return {
      member: null,
      response: NextResponse.json(
        { error: "FEATURE_OFF", message: "Ye feature abhi available nahi hai." },
        { status: 403 },
      ),
    };
  }

  return { member, response: null };
}

/** Step 1 — record and screen. Mirrors /api/media/voice, filed under the owner's account. */
export async function POST(req: Request) {
  const { member, response } = await requireBlessingEligible();
  if (!member) return response;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Audio file nahi mili." }, { status: 400 });
  }

  const result = await uploadAndModerateVoiceClip({
    ownerUserId: member.ownerUserId,
    form,
    logFeature: "parent_blessing_moderation",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json(
    {
      mediaId: result.mediaId,
      durationMs: result.durationMs,
      moderation: result.moderation,
      pendingReview: result.moderation === "PENDING",
      playbackUrl: result.playbackUrl,
    },
    { status: 201 },
  );
}

const PublishSchema = z.object({ mediaId: z.string().min(1) });

/** Step 2 — publish. Replaces any previous blessing (one per profile, see VoiceNote's unique index). */
export async function PUT(req: Request) {
  const { member, response } = await requireBlessingEligible();
  if (!member) return response;

  const parsed = PublishSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Recording chahiye." }, { status: 422 });
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: parsed.data.mediaId, ownerUserId: member.ownerUserId, kind: "VOICE_NOTE", deletedAt: null },
  });
  if (!asset) {
    return NextResponse.json({ ok: false, message: "Recording nahi mili — dobara record kijiye." }, { status: 404 });
  }
  if (asset.moderation === "REJECTED") {
    return NextResponse.json(
      { ok: false, message: asset.moderationReason ?? "Ye recording publish nahi ho sakti." },
      { status: 422 },
    );
  }

  // NOTE on VoiceNote's `@@unique([fromUserId, toUserId, context])`: Postgres
  // treats every NULL as distinct in a unique index, so that constraint does
  // *not* actually stop two PARENT_BLESSING rows (toUserId always null here)
  // from existing for the same owner — every other context has a real
  // toUserId and never hits this gap. The find-delete-create below closes the
  // window as tightly as application code can without a partial index
  // migration; a genuine race (two publishes within milliseconds) could still
  // leave two rows. Reads should treat "most recent" as authoritative until
  // that migration lands.
  const previous = await prisma.voiceNote.findFirst({
    where: { fromUserId: member.ownerUserId, toUserId: null, context: "PARENT_BLESSING" },
    orderBy: { createdAt: "desc" },
    include: { mediaAsset: { select: { id: true, storageKey: true } } },
  });

  if (previous) {
    await prisma.voiceNote.delete({ where: { id: previous.id } });
    // The bytes of a replaced blessing serve no audit purpose the way a
    // rejected clip's do — nobody reported it, it was simply superseded.
    await mediaStorage.remove(previous.mediaAsset.storageKey);
    await prisma.mediaAsset.delete({ where: { id: previous.mediaAsset.id } });
  }

  const voiceNote = await prisma.voiceNote.create({
    data: {
      mediaAssetId: asset.id,
      fromUserId: member.ownerUserId,
      toUserId: null,
      context: "PARENT_BLESSING",
      // Public-on-the-profile content, not a locked teaser waiting on a
      // paywall — see mediaAccess.ts's PARENT_BLESSING branch. "Unlocked" here
      // just keeps the field's meaning ("has anyone approved playback")
      // consistent across every VoiceNote row, even though nothing gates it.
      unlockedAt: new Date(),
    },
  });

  await createNotice({
    userId: member.ownerUserId,
    kind: "FAMILY_ACTION",
    title: "Aapke parivaar ne aashirwad record kiya hai",
    body:
      asset.moderation === "APPROVED"
        ? "Ye ab aapki profile par sabko dikhega."
        : "Review ke baad ye aapki profile par dikhega.",
    href: "/user/dashboard",
    relatedId: voiceNote.id,
  });

  return NextResponse.json({
    ok: true,
    published: asset.moderation === "APPROVED",
    celebration: await celebrateFirst(member.ownerUserId, "first_parent_blessing"),
  });
}
