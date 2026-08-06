import Link from "next/link";
import { notFound } from "next/navigation";
import { Heart, Lock, ShieldCheck } from "lucide-react";
import { resolveInvite } from "@/lib/services/outreach/inviteService";
import BrandMark from "@/components/layout/BrandMark";

/**
 * Where a partner's invite link lands.
 *
 * Standalone — no shell, no nav — because this is opened by someone with no
 * BandhanTak account at all, most likely from a WhatsApp message. Same shape
 * as `/f/[token]` for the same reason.
 *
 * The one thing this page must do is answer "why am I getting this?" before
 * asking for anything. The partner's name goes in the headline, not ours: the
 * reader knows the pandit ji, and a page that opens with our branding reads as
 * an ad. Everything below it is what they get and what we won't do — then one
 * button.
 */
export default async function InviteLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await resolveInvite(token);

  if (invite.status === "not_found") notFound();

  if (invite.status === "already_joined") {
    return (
      <div className="grid min-h-dvh place-items-center px-4 py-10">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 flex justify-center">
            <BrandMark />
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-lg">
            <p className="font-semibold text-ink">Ye invite pehle hi use ho chuka hai.</p>
            <p className="mt-1.5 text-sm text-muted">
              Aapka account ban chuka hai — neeche se login kar lijiye.
            </p>
            <Link
              href="/login"
              className="mt-5 flex min-h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg shadow-md transition-colors hover:bg-primary-hover"
            >
              Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const firstName = invite.fullName.trim().split(/\s+/)[0];

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          <div className="bg-gradient-to-br from-wine-600 via-wine-700 to-wine-900 px-6 py-7">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-white/15">
              <Heart className="size-7 text-white" />
            </span>
            <h1 className="mt-3 text-lg font-bold text-white">
              {invite.partnerName} ne aapko BandhanTak par rishte dhoondhne ke liye invite kiya hai
            </h1>
            <p className="mt-2 text-sm text-white/80">Namaste {firstName} ji 🙏</p>
          </div>

          <div className="space-y-4 p-6 text-left">
            <p className="flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-ink">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" />
              Yahan sirf verified profiles hain, aur {invite.partnerName} bhi aapke liye acche rishte dekhte
              rahenge.
            </p>
            <p className="flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-ink">
              <Lock className="mt-0.5 size-4 shrink-0 text-trust" />
              Aapki details aapke control me rehti hain. Aapka number kisi ko nahi dikhta, aur kisse baat karni hai
              ye faisla hamesha aapka rahega.
            </p>

            <Link
              href={`/j/${token}/start`}
              className="mt-2 flex min-h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg shadow-md transition-colors hover:bg-primary-hover"
            >
              Create My Profile
            </Link>

            <p className="text-center text-xs text-muted">
              Free hai. Baad me chahein to profile kabhi bhi hata sakte hain.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
