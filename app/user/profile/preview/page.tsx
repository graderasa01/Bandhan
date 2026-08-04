import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getSelfReelCard } from "@/lib/data/selfReelCard";
import UserShell from "@/components/layout/UserShell";
import SelfReelCardPreview from "@/components/reel/SelfReelCardPreview";
import Button from "@/components/ui/Button";

/**
 * "How do I look" — the owner's own card, rendered through the exact
 * component a matched stranger eventually sees. Full-bleed for the same
 * reason Rishta Reel and the message thread are: the card shouldn't compete
 * with sidebar/bottom-nav chrome. The back link is the only way out.
 */
export default async function ReelPreviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/profile/preview");

  const card = await getSelfReelCard(user.id);

  return (
    <UserShell userName={user.fullName} fullBleed>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6">
          <Link
            href="/user/profile/me"
            aria-label="Wapas jaayein"
            className="grid size-9 shrink-0 touch-target place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="font-semibold text-ink">Aapka Reel Card</p>
            <p className="truncate text-[0.75rem] text-muted">
              Strangers ko aisa dikhta hai jab wo aap tak swipe karte hain
            </p>
          </div>
        </div>

        {card.photoUrl ? (
          <div className="relative mx-auto w-full max-w-md flex-1 px-4 pb-3">
            <div className="relative h-full w-full">
              <SelfReelCardPreview card={card} />
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
              <Camera className="size-8" />
            </span>
            <div>
              <p className="text-lg font-semibold text-ink">Photo add karein</p>
              <p className="mt-1.5 max-w-sm text-[0.875rem] leading-relaxed text-muted">
                Reel card dekhne ke liye pehle kam se kam ek photo upload karein.
              </p>
            </div>
            <Link href="/user/profile/me">
              <Button variant="primary" size="md">
                Meri Profile Par Jaayein
              </Button>
            </Link>
          </div>
        )}
      </div>
    </UserShell>
  );
}
