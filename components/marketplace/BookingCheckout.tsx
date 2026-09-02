"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Clock, Lock, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { rupees } from "@/lib/services/marketplace/servicePolicy";
import type { BookingQuote } from "@/lib/services/marketplace/bookingService";

/**
 * Checkout for one service.
 *
 * The plan's rule for this screen is specific: list price, discount, taxes,
 * total, renewal, beneficiary, deliverables and the cancellation policy must
 * all be visible before paying. Everything below is that list, said plainly —
 * including the two lines a marketplace is most tempted to bury, which are
 * "this does not renew" and "what the partner will actually be able to see".
 *
 * The partner's share is shown too. That is unusual and deliberate: a buyer
 * paying for a person's time should be able to see how much of it reaches the
 * person, and a platform that hides its own cut invites the guess that it is
 * larger than it is.
 */
export default function BookingCheckout({ quote }: { quote: BookingQuote }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [slots, setSlots] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/services/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: quote.serviceId,
          buyerNote: note.trim() || undefined,
          preferredSlots: slots.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { checkoutUrl?: string; message?: string };
      if (!res.ok || !body.checkoutUrl) {
        setError(body.message ?? "Booking shuru nahi ho payi.");
        setBusy(false);
        return;
      }
      router.push(body.checkoutUrl);
    } catch {
      setError("Internet nahi mil raha. Dobara koshish kariye.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <Card variant="luxe" padding="lg">
        <p className="text-[0.6875rem] uppercase tracking-wide text-muted">{quote.kindLabel}</p>
        <h1 className="mt-0.5 text-xl font-semibold text-wine-700">{quote.name}</h1>
        <p className="mt-1 text-sm text-muted">{quote.partnerName}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink">{quote.promise}</p>
        {quote.scope && <p className="mt-2 text-sm leading-relaxed text-muted">{quote.scope}</p>}

        <div className="mt-4 rounded-lg border border-line bg-bg-subtle px-3.5 py-3">
          <p className="text-xs font-medium text-ink">Kya milega</p>
          <ul className="mt-1.5 space-y-1">
            {quote.deliverables.map((d) => (
              <li key={d} className="flex items-start gap-2 text-sm leading-snug text-muted">
                <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
                {d}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.6875rem] text-muted">Proof: {quote.deliveryProof}</p>
        </div>
      </Card>

      <Card padding="lg">
        <h2 className="text-base font-semibold text-ink">Paisa</h2>
        {quote.adminPriceNote && (
          <p className="mt-1.5 rounded-md border border-line/70 bg-surface-2 px-3 py-2 text-[0.75rem] leading-relaxed text-muted">
            BandhanTak ne is service ka daam khud rakha hai: {quote.adminPriceNote}
          </p>
        )}
        <dl className="mt-3 divide-y divide-line text-sm">
          <div className="flex items-center justify-between py-2">
            <dt className="text-muted">Service ki keemat</dt>
            <dd className="tabular-nums text-ink">
              {rupees(quote.listPricePaise ?? quote.pricePaise)}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-muted">Discount</dt>
            {/* A platform override is a discount and is shown as one — the row
                already existed and always read ₹0, which was true only because
                nothing could ever discount a booking until now. */}
            <dd className="tabular-nums text-ink">
              {quote.listPricePaise !== null
                ? `- ${rupees(quote.listPricePaise - quote.pricePaise)}`
                : "₹0"}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-muted">Tax</dt>
            <dd className="tabular-nums text-ink">Keemat me shaamil</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="font-medium text-ink">Total abhi</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">
              {quote.pricePaise === 0 ? "Free" : rupees(quote.pricePaise)}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-muted">Renewal</dt>
            <dd className="text-ink">Koi nahi — ye ek baar ka payment hai</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-muted">Partner ko milega</dt>
            <dd className="tabular-nums text-muted">
              {rupees(quote.partnerAmountPaise)} · BandhanTak {rupees(quote.platformFeePaise)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card padding="lg">
        <h2 className="text-base font-semibold text-ink">Aapki detail</h2>
        <p className="mt-1 text-xs text-muted">
          Kiske liye: <span className="font-medium text-ink">aap khud</span>. Kisi aur ke liye booking abhi
          nahi ho sakti — uske liye unki apni permission chahiye hogi.
        </p>

        <div className="mt-3">
          <Textarea
            label="Aapko kya chahiye?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Jaise: Jaipur me Agarwal parivaar, 28-32 saal, kaam karne wali ladki"
          />
        </div>
        <div className="mt-3">
          <Input
            label="Aap kab free hote hain?"
            value={slots}
            onChange={(e) => setSlots(e.target.value)}
            maxLength={300}
            placeholder="Jaise: shaam 7-9 baje, weekdays"
          />
        </div>
      </Card>

      <Card variant="soft" padding="lg">
        <h2 className="text-base font-semibold text-ink">Niyam</h2>
        <ul className="mt-2.5 space-y-2 text-sm leading-relaxed text-muted">
          <li className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            Partner ko {quote.acceptSlaHours} ghante me accept karna hoga. Nahi kiya to poora paisa apne aap
            wapas.
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
            Accept se pehle aap kabhi bhi cancel karke poora refund le sakte hain.
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
            Deliver hone ke baad {quote.refundWindowDays} din tak aap complaint kar sakte hain. Us waqt tak
            partner ka paisa roka rehta hai.
          </li>
          <li className="flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            {quote.dataSharedNote}
          </li>
        </ul>
        {quote.cancellationPolicy && (
          <p className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
            Partner ka apna niyam: {quote.cancellationPolicy}
          </p>
        )}
        <p className="mt-3 rounded-lg border border-warn/40 bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
          {quote.noGuaranteeNote}
        </p>
      </Card>

      {error && (
        <Card variant="danger" padding="md">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        </Card>
      )}

      <div className="pb-8">
        <label className="mb-3 flex items-start gap-2.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-gold-600)]"
          />
          Maine upar likhe niyam padh liye hain aur samajh gaya/gayi hoon.
        </label>
        <Button onClick={pay} loading={busy} disabled={!agreed} fullWidth size="lg">
          {quote.pricePaise === 0 ? "Book kariye — koi paisa nahi" : `Pay ${rupees(quote.pricePaise)}`}
        </Button>
      </div>
    </div>
  );
}
