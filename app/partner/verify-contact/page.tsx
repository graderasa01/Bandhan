import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import { verificationProviderStatus } from "@/lib/services/verification/contactVerification/contactVerificationService";
import { getActivePartnerCode } from "@/components/partner/_shared/getActivePartnerCode";
import PartnerShell from "@/components/layout/PartnerShell";
import ContactVerificationPanel from "@/components/verification/ContactVerificationPanel";
import Card from "@/components/ui/Card";

/**
 * The partner's own contact verification — `PARTNER` scope, so it proves
 * `Partner.mobileNumber`/`email` rather than the login contact `/user/verify-contact`
 * handles. Those are different columns on purpose (see `VerificationScope`):
 * the payout gate reads *these*, because these are what an admin would ring
 * when money is in question.
 *
 * Reachable at INACTIVE too, matching `/partner/payouts` — a partner who has
 * gone quiet still needs to be able to settle their pending balance.
 */
export default async function PartnerVerifyContactPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) redirect(redirectTo);

  const partnerCode = await getActivePartnerCode(partner.id);
  const providers = verificationProviderStatus();

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={partnerCode}>
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <section>
          <Link
            href="/partner/payouts"
            className="mb-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Payouts
          </Link>
          <h1 className="text-2xl font-bold text-wine-700">Contact Verify Karein</h1>
          <p className="mt-2 text-sm text-muted">
            Paisa bhejne se pehle hum ye pakka karte hain ki aap tak pahuncha ja sake. Ye wahi number aur email
            hain jo aapne partner banne ke waqt diye the.
          </p>
        </section>

        <Card variant="default" padding="lg">
          <ContactVerificationPanel scope="PARTNER" />
        </Card>

        {(!providers.phone || !providers.email) && (
          <Card variant="soft" padding="md">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" />
              <p className="text-[0.8125rem] leading-relaxed text-muted">
                {!providers.phone && !providers.email
                  ? "Verification abhi setup ho raha hai. Tab tak aapke details admin khud check karke approve karenge."
                  : !providers.phone
                    ? "Mobile verification abhi setup ho raha hai — filhaal email verify kar lijiye."
                    : "Email verification abhi setup ho raha hai — filhaal mobile verify kar lijiye."}
              </p>
            </div>
          </Card>
        )}
      </div>
    </PartnerShell>
  );
}
