"use client";

import { ShieldCheck } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import VoicePlayer from "@/components/voice/VoicePlayer";
import type { ReelVoiceNote } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The reel's half of `ParentBlessingPlayer` — same clip, same claim, in a
 * sheet instead of a card because the reel has no room for one.
 *
 * The "verified" badge is not decoration layered on top, it *is* the claim:
 * only a PARENT-relation FamilyMember who bound their session through this
 * profile owner's own invite link could have recorded it, and it has been
 * through moderation. `/api/media/[id]` re-checks that on every byte
 * (`mediaAccess.ts`), so this sheet cannot leak a clip by being opened.
 *
 * The title says exactly whose voice it is. The reference sketch called this
 * slot "Voice Intro", and a self-recorded introduction is not a thing this
 * product has — labelling a family member's blessing as the candidate's own
 * introduction would be a small lie told on every card that has one.
 */
export default function ReelVoiceSheet({
  open,
  onClose,
  displayName,
  voice,
}: {
  open: boolean;
  onClose: () => void;
  displayName: string;
  voice: ReelVoiceNote | null;
}) {
  const t = useT();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("reel.voiceSheet.title", "{name} ke parivaar ki aawaz").replace("{name}", displayName)}
      variant="bottom"
    >
      <div className="rounded-lg border border-trust/30 bg-trust/5 p-4">
        <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-trust">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          {t("family.parentBlessingPlayer.title", "Verified Parent Blessing")}
        </p>
        <p className="mt-1 text-[0.75rem] leading-snug text-muted">
          {t("family.parentBlessingPlayer.subtitle", "Inke parivaar ke ek verified member ki apni aawaz.")}
        </p>
        {voice && <VoicePlayer className="mt-4" src={`/api/media/${voice.mediaId}`} seconds={voice.seconds} />}
      </div>
    </Sheet>
  );
}
