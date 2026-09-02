import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import VerificationBadgeList from "@/components/verification/VerificationBadgeList";
import MyVerificationRequests from "@/components/verification/MyVerificationRequests";
import { listVerificationBadges } from "@/lib/services/verification/verificationBadgeService";
import { listVerificationRequests } from "@/lib/services/verification/verificationRequestService";
import { VERIFICATION_DISCLOSURE } from "@/lib/services/verification/verificationCatalog";

export const dynamic = "force-dynamic";

/**
 * Everything about this person's own verification, in one place.
 *
 * The badge list here is the *self* view, so it shows the kinds that have not
 * been checked as well — the owner is the one person for whom "abhi check nahi
 * hua" is useful rather than noise, because they are the only one who can do
 * something about it.
 */
export default async function VerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/verification");

  const [badges, requests] = await Promise.all([
    listVerificationBadges(user.id, { viewerUserId: user.id }),
    listVerificationRequests(user.id),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-xl font-bold text-ink">Verification</h1>
        <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
          Har badge sirf utna hi kehta hai jitna check hua — na usse zyada, na kam. Kya check hua aur kab, ye
          har badge ke saath likha rehta hai.
        </p>

        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-ink">Aapke badge</h2>
          <Card padding="md">
            <VerificationBadgeList badges={badges} />
          </Card>
        </section>

        <section className="mt-5">
          <Card padding="md">
            <MyVerificationRequests incoming={requests.incoming} outgoing={requests.outgoing} />
          </Card>
        </section>

        <Card variant="soft" padding="md" className="mt-5">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
            {VERIFICATION_DISCLOSURE} Aapke document ki koi copy app me nahi rakhi jaati — team dekh kar
            nateeja likhti hai, aur wahi dikhta hai.{" "}
            <Link href="/user/verify-contact" className="font-medium text-ink underline underline-offset-2">
              Mobile/email verify
            </Link>{" "}
            aap khud kar sakte hain.
          </p>
        </Card>
      </div>
    </UserShell>
  );
}
