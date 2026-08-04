import ProfileSectionList from "@/components/profile/ProfileSectionList";
import ProfileLevelStrip from "@/components/profile/ProfileLevelStrip";
import type { ProfileViewModel } from "@/lib/contracts/profileView";

/**
 * The same L1/L2/L3 section renderer the owner's own `/user/profile/[id]`
 * uses — a family session sees exactly the level the *owner* has earned with
 * this profile, never more, so reusing the exact component (not a re-styled
 * copy) is what keeps that guarantee visible instead of just asserted.
 */
export default function FamilyProfileDetail({ profile }: { profile: ProfileViewModel }) {
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {profile.lockedHint && <ProfileLevelStrip hint={profile.lockedHint} />}
      <ProfileSectionList sections={profile.sections} />
    </div>
  );
}
