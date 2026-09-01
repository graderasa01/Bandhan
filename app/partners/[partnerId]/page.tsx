import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, MapPin, ShieldCheck, Star, Users } from "lucide-react";
import PublicShell from "@/components/layout/PublicShell";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EnquiryPanel from "@/components/marketplace/EnquiryPanel";
import { getCurrentUser } from "@/lib/auth/session";
import { getPartnerCard } from "@/lib/services/marketplace/marketplaceSearchService";
import { listPartnerReviews } from "@/lib/services/marketplace/reviewService";
import { DATA_SHARED_NOTE, getServiceConfig } from "@/lib/services/marketplace/bookingService";
import { NO_GUARANTEE_NOTE, rupees } from "@/lib/services/marketplace/servicePolicy";

export const dynamic = "force-dynamic";

/**
 * One partner's public card.
 *
 * Everything the plan asks a card to show is here — badge, KYC state, cities,
 * languages, itemised services, capacity, measured response/completion,
 * verified reviews, the cancellation rule, and what data the partner receives
 * after booking. What is deliberately absent is any way to contact them off
 * the platform: the enquiry panel is the whole channel until a booking exists.
 */
export default async function PartnerPublicPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  const [card, user] = await Promise.all([getPartnerCard(partnerId), getCurrentUser()]);
  if (!card) notFound();

  const [reviews, config] = await Promise.all([listPartnerReviews(partnerId), getServiceConfig()]);
  const returnTo = `/partners/${partnerId}`;
  const canBook = card.accepting && !card.full;

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/partners" className="text-sm text-muted hover:text-ink">
          ← Saare partners
        </Link>

        <Card variant="luxe" padding="lg" className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-wine-700">{card.displayName}</h1>
            {card.verified && (
              <span className="inline-flex items-center gap-1 rounded-full border border-trust/30 bg-trust-bg px-2 py-0.5 text-[0.6875rem] font-medium text-trust">
                <BadgeCheck className="size-3" aria-hidden />
                Verified partner
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-[0.6875rem] font-medium text-muted">
              <ShieldCheck className="size-3" aria-hidden />
              KYC: {card.kycStatus === "VERIFIED" ? "verified" : card.kycStatus === "PENDING" ? "review me" : "nahi diya"}
            </span>
          </div>

          {card.headline && <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink">{card.headline}</p>}
          {card.about && <p className="mt-2 text-sm leading-relaxed text-muted">{card.about}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
            {card.cities.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {card.cities.join(", ")}
              </span>
            )}
            {card.languages.length > 0 && <span>{card.languages.join(" · ")}</span>}
            {/* Measured, never declared — see marketplaceSearchService. A brand
                new partner shows nothing here rather than a flattering default. */}
            {card.stats.medianAcceptHours !== null ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                Aam taur par ~{card.stats.medianAcceptHours} ghante me accept
              </span>
            ) : (
              <span>Naye partner — abhi koi record nahi</span>
            )}
            {card.stats.completionRatePercent !== null && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {card.stats.completionRatePercent}% bookings poori hui
              </span>
            )}
            {card.stats.averageRating !== null && (
              <span className="inline-flex items-center gap-1 text-gold-700 dark:text-gold-300">
                <Star className="size-3.5 fill-current" aria-hidden />
                {card.stats.averageRating} / 5 ({card.stats.reviewCount})
              </span>
            )}
          </div>

          {!canBook && (
            <p className="mt-4 rounded-lg border border-warn/40 bg-warn-bg px-3 py-2 text-sm text-warn">
              {!card.accepting
                ? "Ye partner abhi nayi bookings nahi le rahe."
                : "Ye partner abhi full hain — sawaal poochh sakte hain, booking baad me."}
              {card.capacityNote ? ` ${card.capacityNote}` : ""}
            </p>
          )}
        </Card>

        <section className="mt-6">
          <h2 className="text-lg font-semibold text-ink">Services</h2>
          <div className="mt-3 flex flex-col gap-3">
            {card.services.map((s) => (
              <Card key={s.id} padding="lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{s.name}</p>
                    <p className="mt-0.5 text-[0.6875rem] uppercase tracking-wide text-muted">{s.kindLabel}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{s.promise}</p>
                    {s.scope && <p className="mt-2 text-sm leading-relaxed text-ink">{s.scope}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xl font-semibold tabular-nums text-ink">{rupees(s.priceInPaise)}</p>
                    <p className="text-[0.6875rem] text-muted">{s.deliveryDays} din me</p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-line bg-bg-subtle px-3 py-2.5">
                  <p className="text-xs font-medium text-ink">Kya milega</p>
                  <ul className="mt-1.5 space-y-1">
                    {s.deliverables.map((d) => (
                      <li key={d} className="flex items-start gap-2 text-sm leading-snug text-muted">
                        <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
                        {d}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[0.6875rem] text-muted">Proof: {s.deliveryProof}</p>
                </div>

                <p className="mt-2.5 text-xs leading-relaxed text-muted">
                  Cancel/refund: partner ke accept karne se pehle poora refund. Accept ke baad kaam deliver na
                  hone par complaint par refund. Partner ne {config.acceptSlaHours} ghante me accept na kiya to
                  paisa apne aap wapas.
                  {s.cancellationPolicy ? ` ${s.cancellationPolicy}` : ""}
                </p>

                <div className="mt-4">
                  {canBook ? (
                    <Link href={`/partners/${partnerId}/book/${s.id}`}>
                      <Button>Book — {rupees(s.priceInPaise)}</Button>
                    </Link>
                  ) : (
                    <Button disabled>Abhi available nahi</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>

        <Card variant="info" padding="md" className="mt-6">
          <p className="text-xs leading-relaxed text-ink">{DATA_SHARED_NOTE}</p>
        </Card>

        <section className="mt-6">
          <EnquiryPanel
            partnerId={partnerId}
            partnerName={card.displayName}
            signedIn={Boolean(user)}
            returnTo={returnTo}
          />
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold text-ink">Reviews</h2>
          {reviews.length === 0 ? (
            <Card variant="soft" padding="md" className="mt-3">
              <p className="text-sm text-muted">
                Abhi koi review nahi. Review sirf wahi de sakta hai jiski booking poori ho chuki ho.
              </p>
            </Card>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {reviews.map((r) => (
                <Card key={r.id} padding="md">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{r.authorFirstName}</p>
                    <span className="inline-flex items-center gap-1 text-sm text-gold-700 dark:text-gold-300">
                      <Star className="size-3.5 fill-current" aria-hidden />
                      {r.rating}/5
                    </span>
                  </div>
                  <p className="mt-0.5 text-[0.6875rem] text-muted">{r.serviceName}</p>
                  {r.body && <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>}
                </Card>
              ))}
            </div>
          )}
        </section>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted">{NO_GUARANTEE_NOTE}</p>
      </div>
    </PublicShell>
  );
}
