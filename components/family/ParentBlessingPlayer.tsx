import { ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import VoicePlayer from "@/components/voice/VoicePlayer";

/**
 * Shown only once `getPublicParentBlessing` has already confirmed the clip
 * cleared moderation — the "verified" badge here is not decoration layered on
 * top, it *is* the claim: only a PARENT-relation FamilyMember who bound their
 * session through this profile owner's own invite link could ever have
 * recorded it (see the family-portal blessing route). No verification, no
 * badge, no render — same rule §7 of the engagement doc states in prose.
 */
export default function ParentBlessingPlayer({ mediaId, seconds }: { mediaId: string; seconds: number }) {
  return (
    <Card padding="md" className="border-trust/30 bg-trust/5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0 text-trust" />
        <p className="text-[0.8125rem] font-semibold text-trust">Verified Parent Blessing</p>
      </div>
      <p className="mt-1 text-[0.75rem] text-muted">Inke parivaar ke ek verified member ki apni aawaz.</p>
      <VoicePlayer className="mt-3" src={`/api/media/${mediaId}`} seconds={seconds} />
    </Card>
  );
}
