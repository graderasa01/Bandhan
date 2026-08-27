import { redirect } from "next/navigation";
import { Info } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import CampaignBuilder from "@/components/spotlight/CampaignBuilder";
import CampaignStatusCard from "@/components/spotlight/CampaignStatusCard";
import EligibilityChecklist from "@/components/spotlight/EligibilityChecklist";
import { checkCampaignEligibility } from "@/lib/services/spotlight/eligibility";
import { listTargetableCities } from "@/lib/services/spotlight/audience";
import { getMyCampaigns, loadCampaignDefaults } from "@/lib/services/spotlight/campaignService";
import { listCampaignPacks } from "@/lib/services/items/itemPurchaseService";
import { SPOTLIGHT_LABEL, SPOTLIGHT_LABEL_NOTE } from "@/lib/services/spotlight/spotlightPolicy";
import type { SpotlightCampaignConfig } from "@/lib/constants/serviceItems";

/**
 * Grio Spotlight — pay to be seen by people you would have matched anyway.
 *
 * The page opens by saying what the product is *not*, and that is deliberate.
 * Paid visibility in a matrimony app is one bad decision away from being a
 * trust problem, so the three limits are stated on the buy screen itself
 * rather than buried in terms: the card carries a visible Spotlight label, the
 * audience is filtered both ways, and nothing about being paid for changes how
 * anyone is ranked or badged.
 */
export default async function SpotlightPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/spotlight");

  const [eligibility, packs, cities, campaigns, defaults] = await Promise.all([
    checkCampaignEligibility(user.id),
    listCampaignPacks(),
    listTargetableCities(),
    getMyCampaigns(user.id),
    loadCampaignDefaults(user.id),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Grio Spotlight</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Apni profile un logon tak pahunchayein jo waise bhi aapke liye sahi hain — bas thoda jaldi. Wada sirf
            itna hai ki gine-chune, alag-alag log aapki profile dekhenge.
          </p>
        </section>

        <Card variant="soft" padding="md" className="mb-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
            <div className="text-[0.8125rem] leading-relaxed text-muted">
              <p className="font-medium text-ink">Teen cheezein paise se nahi badaltin</p>
              <ul className="mt-1.5 space-y-1">
                <li>
                  Card par <strong className="text-ink">{SPOTLIGHT_LABEL}</strong> likha dikhega — “{SPOTLIGHT_LABEL_NOTE}”.
                  Interest, match ya chat me ye nishaan kabhi nahi jaata.
                </li>
                <li>
                  Aapki profile sirf unhe dikhegi jinki apni pasand me bhi aap aate hain. Paisa dayra bada karta
                  hai, kisi ki “nahi” ko “haan” nahi banata.
                </li>
                <li>
                  Trust score, verified badge aur matching ka hisaab bilkul waise ka waisa rehta hai. Ye cheezein
                  kamai jaati hain, kharidi nahi.
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {campaigns.length > 0 && (
          <section className="mb-6 space-y-3">
            <h2 className="text-lg font-semibold text-ink">Aapke campaigns</h2>
            {campaigns.map((c) => (
              <CampaignStatusCard key={c.id} campaign={c} />
            ))}
          </section>
        )}

        {!eligibility.eligible ? (
          <EligibilityChecklist requirements={eligibility.requirements} />
        ) : packs.length === 0 ? (
          <Card variant="soft" padding="lg" className="text-center">
            <p className="text-sm text-muted">Abhi koi Spotlight pack available nahi hai.</p>
          </Card>
        ) : (
          <CampaignBuilder
            packs={packs.map((p) => {
              const config = p.config as SpotlightCampaignConfig;
              return {
                code: p.code,
                name: p.name,
                description: p.description,
                price: "₹" + (p.priceInPaise / 100).toLocaleString("en-IN"),
                reach: config.reach,
                maxDays: config.maxDays,
              };
            })}
            cities={cities}
            defaults={defaults}
          />
        )}
      </div>
    </UserShell>
  );
}
