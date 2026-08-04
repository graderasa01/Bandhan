import Link from "next/link";
import { notFound } from "next/navigation";
import { Heart, ShieldCheck, Users } from "lucide-react";
import { resolveInvite, FAMILY_RELATION_LABELS } from "@/lib/services/family/familyService";
import { getCurrentFamilyMember } from "@/lib/auth/familySession";
import BrandMark from "@/components/layout/BrandMark";
import JoinFamilyButton from "@/components/family/JoinFamilyButton";
import InviteInactiveCard from "@/components/family/InviteInactiveCard";

/**
 * The entire onboarding, in one screen: what the person is being asked to
 * join, what they will and won't see, and one button. Nothing to type — the
 * link itself was the invitation; tapping the button is the only step left.
 *
 * Standalone on purpose (no shell, no nav) — this is opened by someone with
 * no BandhanTak account at all, most likely a parent handed a WhatsApp link.
 */
export default async function FamilyInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, currentMember] = await Promise.all([resolveInvite(token), getCurrentFamilyMember()]);

  if (invite.status === "not_found") notFound();
  if (invite.status === "expired" || invite.status === "revoked") return <InviteInactiveCard reason={invite.status} />;

  const alreadyJoined = currentMember?.id === invite.member.id;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          <div className="bg-gradient-to-br from-wine-600 via-wine-700 to-wine-900 px-6 py-7">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-white/15">
              <Users className="size-7 text-white" />
            </span>
            <h1 className="mt-3 text-lg font-bold text-white">
              {invite.ownerName} ne aapko {FAMILY_RELATION_LABELS[invite.member.relation]} ke roop me apne Family
              Circle me jodne ke liye bheja hai
            </h1>
          </div>

          <div className="space-y-4 p-6 text-left">
            <p className="flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-ink">
              <Heart className="mt-0.5 size-4 shrink-0 text-trust" />
              Aap {invite.ownerName} ke matches aur shortlist dekh sakenge, aur apni raay ke liye profile
              shortlist kar sakenge.
            </p>
            <p className="flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-ink">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" />
              Unki chat aapko <strong>kabhi nahi</strong> dikhegi, aur aap kisi ko interest nahi bhej sakenge —
              faisla hamesha {invite.ownerName} ka rahega.
            </p>

            {alreadyJoined ? (
              <Link
                href="/family"
                className="mt-2 flex min-h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg shadow-md transition-colors hover:bg-primary-hover"
              >
                Aap pehle se jud chuke hain — Dashboard dekhein
              </Link>
            ) : (
              <JoinFamilyButton token={token} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
