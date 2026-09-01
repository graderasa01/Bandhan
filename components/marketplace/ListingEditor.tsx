"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgeCheck, Eye, Plus, Store, Trash2, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import {
  MAX_ABOUT_CHARS,
  MAX_HEADLINE_CHARS,
  NO_GUARANTEE_NOTE,
  SERVICE_KINDS,
  rupees,
} from "@/lib/services/marketplace/servicePolicy";
import type { PartnerServiceKind } from "@prisma/client";
import { cn } from "@/lib/utils";

export interface ListingState {
  isListed: boolean;
  headline: string;
  about: string;
  languages: string[];
  cities: string[];
  acceptingBookings: boolean;
  weeklyCapacity: number;
  capacityNote: string;
  approved: boolean;
  rejectionNote: string | null;
  awaitingReview: boolean;
  readinessMissing: string[];
}

export interface ServiceState {
  kind: PartnerServiceKind;
  name: string;
  scope: string;
  deliverables: string[];
  priceInPaise: number;
  deliveryDays: number;
  isActive: boolean;
}

/**
 * The partner's shopfront editor.
 *
 * Two things this screen is careful about:
 *
 * 1. **It tells the partner the truth about visibility.** A listing is live
 *    only when the partner opted in *and* an admin approved it, and editing the
 *    copy sends it back for review. That is stated at the top rather than
 *    discovered when the card does not appear.
 * 2. **The promise is not editable.** Each service kind's promise line comes
 *    from the catalog and is shown read-only beside the price. A partner
 *    writing their own promise is how a marriage guarantee reaches a public
 *    page, and this editor never offers the field.
 */
export default function ListingEditor({
  initialListing,
  initialServices,
}: {
  initialListing: ListingState;
  initialServices: ServiceState[];
}) {
  const router = useRouter();
  const [listing, setListing] = useState(initialListing);
  const [services, setServices] = useState(initialServices);
  const [cityInput, setCityInput] = useState("");
  const [langInput, setLangInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editingKind, setEditingKind] = useState<PartnerServiceKind | null>(null);

  async function saveListing() {
    setBusy("listing");
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/partner/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isListed: listing.isListed,
          headline: listing.headline || null,
          about: listing.about || null,
          languages: listing.languages,
          cities: listing.cities.map((c) => ({ city: c })),
          acceptingBookings: listing.acceptingBookings,
          weeklyCapacity: listing.weeklyCapacity,
          capacityNote: listing.capacityNote || null,
        }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Save nahi hua.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Internet nahi mil raha.");
    } finally {
      setBusy(null);
    }
  }

  async function saveService(s: ServiceState) {
    setBusy(s.kind);
    setError(null);
    try {
      const res = await fetch("/api/partner/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: s.kind,
          name: s.name,
          scope: s.scope || null,
          deliverables: s.deliverables.filter((d) => d.trim()),
          priceInPaise: s.priceInPaise,
          deliveryDays: s.deliveryDays,
          acceptSlaHours: null,
          cancellationPolicy: null,
          isActive: s.isActive,
        }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Service save nahi hui.");
        return;
      }
      setEditingKind(null);
      router.refresh();
    } catch {
      setError("Internet nahi mil raha.");
    } finally {
      setBusy(null);
    }
  }

  function updateService(kind: PartnerServiceKind, patch: Partial<ServiceState>) {
    setServices((prev) => prev.map((s) => (s.kind === kind ? { ...s, ...patch } : s)));
  }

  function addService(kind: PartnerServiceKind) {
    const spec = SERVICE_KINDS.find((s) => s.kind === kind)!;
    setServices((prev) => [
      ...prev,
      {
        kind,
        name: spec.label,
        scope: "",
        deliverables: [...spec.defaultDeliverables],
        priceInPaise: spec.minPricePaise,
        deliveryDays: spec.defaultDeliveryDays,
        isActive: true,
      },
    ]);
    setEditingKind(kind);
  }

  const unusedKinds = SERVICE_KINDS.filter((spec) => !services.some((s) => s.kind === spec.kind));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section>
        <h1 className="text-2xl font-bold text-wine-700">My Listing</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Ye wo page hai jo log <Link href="/partners" className="underline">/partners</Link> par dekhenge.
        </p>
      </section>

      {/* Visibility status, said plainly rather than left to be discovered. */}
      <Card
        variant={listing.approved && listing.isListed ? "trust" : listing.rejectionNote ? "danger" : "warning"}
        padding="md"
      >
        <div className="flex gap-2.5">
          {listing.approved && listing.isListed ? (
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          )}
          <div>
            <p className="text-sm font-semibold text-ink">
              {listing.approved && listing.isListed
                ? "Aapka listing live hai"
                : listing.rejectionNote
                  ? "Listing reject hui"
                  : listing.awaitingReview
                    ? "Review ka intezaar"
                    : "Abhi live nahi"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {listing.rejectionNote
                ? listing.rejectionNote
                : listing.readinessMissing.length > 0
                  ? `Pehle ye poora kariye: ${listing.readinessMissing.join(", ")}.`
                  : listing.awaitingReview
                    ? "Team dekh rahi hai. Approve hote hi aapka card public ho jayega."
                    : "Listing on karke save kariye — phir team ek baar dekhegi."}
            </p>
            <p className="mt-1.5 text-[0.6875rem] text-muted">
              Headline, about ya bhasha badalne par listing dobara review me chali jaati hai.
            </p>
          </div>
        </div>
        {listing.approved && listing.isListed && (
          <div className="mt-3">
            <Link href="/partners">
              <Button size="sm" variant="secondary" icon={<Eye className="size-4" />}>
                View Public Page
              </Button>
            </Link>
          </div>
        )}
      </Card>

      {error && (
        <Card variant="danger" padding="md">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        </Card>
      )}

      <Card padding="lg">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={listing.isListed}
            onChange={(e) => setListing({ ...listing, isListed: e.target.checked })}
            className="mt-0.5 size-4 accent-[var(--color-gold-600)]"
          />
          <span>
            <span className="text-sm font-medium text-ink">Marketplace par dikhna hai</span>
            <span className="mt-0.5 block text-xs text-muted">
              Band karne par aapka card turant hat jaata hai. Chalu bookings par asar nahi padta.
            </span>
          </span>
        </label>

        <div className="mt-4">
          <Input
            label="Ek line me — aap kya karte hain"
            value={listing.headline}
            maxLength={MAX_HEADLINE_CHARS}
            onChange={(e) => setListing({ ...listing, headline: e.target.value })}
            placeholder="Jaise: 18 saal se Jaipur me Agarwal rishte"
          />
        </div>

        <div className="mt-3">
          <Textarea
            label="Apne baare me"
            value={listing.about}
            rows={4}
            maxLength={MAX_ABOUT_CHARS}
            onChange={(e) => setListing({ ...listing, about: e.target.value })}
          />
        </div>

        <ChipEditor
          label="Cities jahan aap kaam karte hain"
          items={listing.cities}
          input={cityInput}
          setInput={setCityInput}
          onAdd={(v) => setListing({ ...listing, cities: [...new Set([...listing.cities, v])] })}
          onRemove={(v) => setListing({ ...listing, cities: listing.cities.filter((c) => c !== v) })}
          placeholder="Jaipur"
        />

        <ChipEditor
          label="Bhasha"
          items={listing.languages}
          input={langInput}
          setInput={setLangInput}
          onAdd={(v) => setListing({ ...listing, languages: [...new Set([...listing.languages, v])] })}
          onRemove={(v) => setListing({ ...listing, languages: listing.languages.filter((c) => c !== v) })}
          placeholder="Hindi"
        />

        <div className="mt-4 rounded-lg border border-line bg-bg-subtle p-3.5">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={listing.acceptingBookings}
              onChange={(e) => setListing({ ...listing, acceptingBookings: e.target.checked })}
              className="size-4 accent-[var(--color-gold-600)]"
            />
            <span className="text-sm font-medium text-ink">Abhi nayi bookings le rahe hain</span>
          </label>
          <div className="mt-3">
            <Input
              label="Ek saath kitni bookings sambhal sakte hain"
              type="number"
              min={0}
              max={50}
              value={String(listing.weeklyCapacity)}
              onChange={(e) => setListing({ ...listing, weeklyCapacity: Number(e.target.value) || 0 })}
              helperText="Itni active bookings hone par aapka card 'full' dikhega — aap band nahi hote."
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={saveListing} loading={busy === "listing"}>
            Save Listing
          </Button>
          {saved && <span className="text-sm text-trust">Save ho gaya</span>}
        </div>
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-ink">Services aur keemat</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Har service ka vaada BandhanTak likhta hai — aap keemat, scope aur kya deliver hoga wo likhte hain.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          {services.map((s) => {
            const spec = SERVICE_KINDS.find((k) => k.kind === s.kind)!;
            const editing = editingKind === s.kind;
            return (
              <Card key={s.kind} padding="lg" variant={s.isActive ? "default" : "soft"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{s.name}</p>
                    <p className="mt-0.5 text-[0.6875rem] uppercase tracking-wide text-muted">{spec.label}</p>
                  </div>
                  <p className="shrink-0 text-lg font-semibold tabular-nums text-ink">{rupees(s.priceInPaise)}</p>
                </div>

                <p className="mt-2 rounded-lg border border-line bg-bg-subtle px-3 py-2 text-xs leading-relaxed text-muted">
                  <span className="font-medium text-ink">Vaada (badla nahi ja sakta):</span> {spec.promise}
                </p>

                {editing ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <Input
                      label="Naam"
                      value={s.name}
                      onChange={(e) => updateService(s.kind, { name: e.target.value })}
                    />
                    <Input
                      label={`Keemat (₹${spec.minPricePaise / 100} – ₹${spec.maxPricePaise / 100})`}
                      type="number"
                      value={String(s.priceInPaise / 100)}
                      onChange={(e) => updateService(s.kind, { priceInPaise: Math.round(Number(e.target.value) * 100) })}
                    />
                    <Input
                      label="Kitne din me deliver"
                      type="number"
                      min={1}
                      max={90}
                      value={String(s.deliveryDays)}
                      onChange={(e) => updateService(s.kind, { deliveryDays: Number(e.target.value) || 1 })}
                    />
                    <Textarea
                      label="Scope — kya shaamil hai, kya nahi"
                      value={s.scope}
                      rows={3}
                      onChange={(e) => updateService(s.kind, { scope: e.target.value })}
                    />
                    <div>
                      <p className="text-sm font-medium text-ink">Kya deliver hoga</p>
                      <p className="text-xs text-muted">Har line ek milestone banegi, jise client confirm karega.</p>
                      {s.deliverables.map((d, i) => (
                        <div key={i} className="mt-2 flex gap-2">
                          <Input
                            value={d}
                            onChange={(e) => {
                              const next = [...s.deliverables];
                              next[i] = e.target.value;
                              updateService(s.kind, { deliverables: next });
                            }}
                          />
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={() =>
                              updateService(s.kind, { deliverables: s.deliverables.filter((_, n) => n !== i) })
                            }
                            className="grid size-12 shrink-0 place-items-center rounded-full text-muted hover:bg-bg-subtle"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                      {s.deliverables.length < 8 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2"
                          onClick={() => updateService(s.kind, { deliverables: [...s.deliverables, ""] })}
                          icon={<Plus className="size-4" />}
                        >
                          Add Deliverable
                        </Button>
                      )}
                    </div>
                    <label className="flex items-center gap-2.5 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={s.isActive}
                        onChange={(e) => updateService(s.kind, { isActive: e.target.checked })}
                        className="size-4 accent-[var(--color-gold-600)]"
                      />
                      Ye service abhi bik rahi hai
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveService(s)} loading={busy === s.kind}>
                        Save Service
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingKind(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditingKind(s.kind)}>
                      Edit
                    </Button>
                    {!s.isActive && (
                      <span className="rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-[0.6875rem] text-muted">
                        Band hai
                      </span>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {unusedKinds.length > 0 && (
          <Card variant="soft" padding="md" className="mt-3">
            <p className="text-sm font-medium text-ink">Aur service jodein</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unusedKinds.map((spec) => (
                <button
                  key={spec.kind}
                  type="button"
                  onClick={() => addService(spec.kind)}
                  className={cn(
                    "min-h-12 rounded-full border border-line-strong bg-surface px-3.5 text-sm text-ink",
                    "transition-colors hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
                  )}
                >
                  + {spec.label}
                </button>
              ))}
            </div>
          </Card>
        )}
      </section>

      <Card variant="warning" padding="md">
        <div className="flex gap-2.5">
          <Store className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">{NO_GUARANTEE_NOTE}</p>
        </div>
      </Card>
    </div>
  );
}

function ChipEditor({
  label,
  items,
  input,
  setInput,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  items: string[];
  input: string;
  setInput: (v: string) => void;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-ink">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-subtle px-2.5 py-1 text-sm text-ink"
          >
            {i}
            <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${i}`} className="text-muted">
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              onAdd(input.trim());
              setInput("");
            }
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (input.trim()) {
              onAdd(input.trim());
              setInput("");
            }
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
