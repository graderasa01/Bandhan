import { Award, ShieldCheck } from "lucide-react";
import type { PartnerCardViewModel } from "@/lib/contracts/partner";
import { getT } from "@/lib/i18n/server";

/**
 * The partner's official card — the one thing on the dashboard that is about
 * them rather than about their leads.
 *
 * Deliberately shaped like a physical card (fixed aspect, code along the
 * bottom like an account number) because that is how it gets used: a partner
 * holds their phone out across a shop counter to show a family they are a real
 * BandhanTak partner, next to the QR they already print. It has to read at
 * arm's length and it has to look like it was issued, not generated.
 *
 * Gradients are hardcoded metal rather than theme tokens. Bronze/Silver/Gold
 * *are* the identity — a Gold card that turns wine-red under a different admin
 * theme pack is no longer a Gold card. Everything else on the page still
 * follows the theme.
 */

const TIER_SURFACE: Record<PartnerCardViewModel["tier"], string> = {
  // Two-stop-plus-highlight in each: a flat gradient reads as a coloured box,
  // the off-axis light band is what makes it read as metal.
  BRONZE: "bg-[linear-gradient(135deg,#7a4423_0%,#b87333_38%,#e8a765_52%,#a05f2c_68%,#6b3a1d_100%)]",
  SILVER: "bg-[linear-gradient(135deg,#6b7280_0%,#b6bec9_36%,#eef2f6_52%,#9aa4b2_68%,#5d6674_100%)]",
  GOLD: "bg-[linear-gradient(135deg,#8a6a12_0%,#d4af37_36%,#f7e39b_52%,#c9a227_68%,#7d5f0f_100%)]",
};

/** Silver and Gold are light enough that white text on them is unreadable. */
const TIER_INK: Record<PartnerCardViewModel["tier"], string> = {
  BRONZE: "text-white",
  SILVER: "text-[#1f2937]",
  GOLD: "text-[#3d2f05]",
};

const TIER_SUBTLE: Record<PartnerCardViewModel["tier"], string> = {
  BRONZE: "text-white/75",
  SILVER: "text-[#1f2937]/70",
  GOLD: "text-[#3d2f05]/70",
};

/**
 * The unfilled part is always a *darkening* of the metal, never a lightening.
 * A white-tinted track on bronze sat too close to a white fill — the bar read
 * as full at a glance when it was a third full, which is the one thing a
 * progress bar must never do.
 */
const TIER_TRACK: Record<PartnerCardViewModel["tier"], string> = {
  BRONZE: "bg-black/35",
  SILVER: "bg-black/20",
  GOLD: "bg-black/20",
};

const TIER_FILL: Record<PartnerCardViewModel["tier"], string> = {
  BRONZE: "bg-white",
  SILVER: "bg-[#1f2937]",
  GOLD: "bg-[#3d2f05]",
};

export default async function PartnerCard({ card }: { card: PartnerCardViewModel }) {
  const t = await getT();
  const ink = TIER_INK[card.tier];
  const subtle = TIER_SUBTLE[card.tier];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 shadow-lg ${TIER_SURFACE[card.tier]} ${ink}`}
    >
      {/* Sheen. Purely decorative, and aria-hidden so a screen reader doesn't
          announce an empty div between the tier name and the code. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-white/20 blur-2xl"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[0.6875rem] font-semibold uppercase tracking-[0.14em] ${subtle}`}>
            {t("partner.card.badge", "BandhanTak Partner")}
          </p>
          <p className="mt-1 truncate text-xl font-bold leading-tight">{card.displayName}</p>
        </div>

        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider">
          <Award className="size-3.5" />
          {card.tierLabel}
        </span>
      </div>

      <div className="relative mt-5 flex items-end justify-between gap-4">
        <div>
          <p className={`text-[0.6875rem] ${subtle}`}>{t("partner.card.commissionRate", "Aapki commission rate")}</p>
          <p className="text-[1.75rem] font-bold leading-none">{card.commissionPercentDisplay}</p>
        </div>
        <div className="text-right">
          <p className={`text-[0.6875rem] ${subtle}`}>{t("partner.card.paidConversions", "Plan liya")}</p>
          <p className="text-[1.75rem] font-bold leading-none">{card.paidConversions}</p>
        </div>
      </div>

      {card.nextTierLabel ? (
        <div className="relative mt-4">
          <div className={`h-1.5 w-full overflow-hidden rounded-full ${TIER_TRACK[card.tier]}`}>
            <div
              className={`h-full rounded-full ${TIER_FILL[card.tier]}`}
              style={{ width: `${Math.round(card.progressFraction * 100)}%` }}
            />
          </div>
          <p className={`mt-1.5 text-xs ${subtle}`}>
            {card.remainingForNextTier} {t("partner.card.moreToNextTier", "aur log plan lein →")}{" "}
            <strong>{card.nextTierLabel}</strong>
            {card.nextTierBonusDisplay
              ? ` (${card.nextTierBonusDisplay} ${t("partner.card.extraCommission", "extra commission")})`
              : ""}
          </p>
        </div>
      ) : (
        <p className={`relative mt-4 flex items-center gap-1.5 text-xs font-semibold ${subtle}`}>
          <ShieldCheck className="size-3.5" />
          {t(
            "partner.card.highestTier",
            "Highest tier — sabse zyada commission rate aapko mil rahi hai.",
          )}
        </p>
      )}

      <div className="relative mt-5 flex items-end justify-between gap-3">
        <p className="font-mono text-sm tracking-[0.2em]">{card.partnerCode ?? "—"}</p>
        {card.memberSince && (
          <p className={`text-[0.6875rem] ${subtle}`}>
            {t("partner.card.since", "Since")} {card.memberSince}
          </p>
        )}
      </div>
    </div>
  );
}
