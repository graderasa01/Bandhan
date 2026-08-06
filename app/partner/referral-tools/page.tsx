import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requirePartner } from "@/lib/auth/requirePartner";
import { getReferralTools } from "@/lib/data/partnerData";
import PartnerShell from "@/components/layout/PartnerShell";
import ReferralLinkCard from "@/components/partner/ReferralLinkCard";
import Card from "@/components/ui/Card";

const TIPS = [
  "WhatsApp status aur family groups me referral link share karein",
  "Community events me QR code print karke rakhein",
  "Jo log aapse rishta poochte hain, unhe seedha link bhej dijiye",
];

export default async function ReferralToolsPage() {
  const { partner, redirectTo } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) redirect(redirectTo);

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const data = await getReferralTools(partner, `${protocol}://${host}`);

  return (
    <PartnerShell partnerName={partner.fullName} partnerCode={data.partnerCode}>
      <div className="mx-auto max-w-xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Referral Tools</h1>
          <p className="mt-2 text-sm text-muted">
            {data.stats.totalClicks} baar link khula, {data.stats.totalRegistrations} logon ne register kiya.
          </p>
        </section>

        {data.partnerCode && data.referralLink ? (
          <>
            <ReferralLinkCard partnerCode={data.partnerCode} referralLink={data.referralLink} />

            <Card variant="elevated" padding="lg" className="mt-4 text-center">
              <p className="text-sm text-muted">QR code — print karke ya phone par dikha kar use karein</p>
              <div className="mx-auto mt-3 w-48 overflow-hidden rounded-md border border-line bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- generated per-partner at request time */}
                <img src="/api/partners/me/qr?format=svg" alt={`Referral QR ${data.partnerCode}`} className="w-full" />
              </div>
              <a
                href="/api/partners/me/qr?format=png"
                download
                className="mt-4 inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-primary-text underline underline-offset-2"
              >
                <Download className="size-4" />
                Download High-Quality PNG
              </a>
            </Card>
          </>
        ) : (
          <Card variant="warning" padding="lg">
            <p className="font-semibold text-ink">Abhi referral code nahi mila.</p>
            <p className="mt-1.5 text-sm text-muted">
              Code approval ke saath hi banta hai. Agar aapka account approved hai aur phir bhi code nahi dikh raha,
              support se contact karein.
            </p>
          </Card>
        )}

        <h2 className="mb-3 mt-6 text-lg font-semibold text-ink">Tips</h2>
        <div className="mb-6 flex flex-col gap-2">
          {TIPS.map((tip, i) => (
            <Card key={tip} variant="soft" padding="sm">
              <div className="flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-fg">
                  {i + 1}
                </span>
                <span className="text-sm text-ink">{tip}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </PartnerShell>
  );
}
