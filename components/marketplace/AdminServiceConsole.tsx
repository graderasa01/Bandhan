"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgeCheck, Eye, EyeOff, IndianRupee, Star, Store } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ALLOCATION_STATUS_LABEL, BOOKING_STATUS_LABEL, rupees } from "@/lib/services/marketplace/servicePolicy";
import type { ServiceAllocationStatus, ServiceBookingStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

export interface AdminBookingRow {
  id: string;
  status: ServiceBookingStatus;
  serviceName: string;
  partnerName: string;
  buyerName: string;
  pricePaise: number;
  partnerAmountPaise: number;
  allocationStatus: ServiceAllocationStatus | null;
  createdAt: string;
  disputeReason: string | null;
  resolutionNote: string | null;
}

export interface AdminListingRow {
  partnerId: string;
  partnerName: string;
  city: string;
  headline: string | null;
  about: string | null;
  languages: string[];
  areas: string[];
  services: {
    id: string;
    kind: string;
    name: string;
    priceInPaise: number;
    /** The platform's own price, when staff have set one. Null = partner's price stands. */
    adminPricePaise: number | null;
    adminPriceNote: string | null;
    deliverables: string[];
  }[];
}

export interface AdminReviewRow {
  id: string;
  partnerName: string;
  authorFirstName: string;
  rating: number;
  body: string | null;
  hidden: boolean;
  createdAt: string;
}

type Tab = "bookings" | "listings" | "reviews";

/**
 * The service desk: complaints, listing approvals and review moderation in one
 * place, because they are all "a human looking at something a rule could not
 * decide".
 *
 * Every action here demands a reason and writes an `AdminAuditLog` row server
 * side. Refund and Release are the two that move money, so they are the two
 * that are visually separated and never adjacent to a bulk control — there is
 * no "resolve all".
 */
export default function AdminServiceConsole({
  bookings,
  listings,
  reviews,
}: {
  bookings: AdminBookingRow[];
  listings: AdminListingRow[];
  reviews: AdminReviewRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(listings.length > 0 ? "listings" : "bookings");
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Action poora nahi hua.");
        return;
      }
      router.refresh();
    } catch {
      setError("Internet nahi mil raha.");
    } finally {
      setBusy(null);
    }
  }

  const disputed = bookings.filter((b) => b.status === "DISPUTED");

  return (
    <div className="mx-auto max-w-3xl">
      <section className="mb-5">
        <h1 className="text-2xl font-bold text-wine-700">Partner Services</h1>
        <p className="mt-1.5 text-sm text-muted">
          Bookings, complaints, listing approvals aur reviews — sab ek jagah.
        </p>
      </section>

      <div className="mb-4 flex gap-2">
        {(
          [
            ["listings", `Listings (${listings.length})`],
            ["bookings", `Bookings (${bookings.length})`],
            ["reviews", `Reviews (${reviews.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "min-h-12 rounded-full border px-4 text-sm font-medium transition-colors",
              tab === id
                ? "border-transparent bg-gradient-to-r from-gold-400 to-gold-600 text-primary-fg"
                : "border-line-strong bg-surface text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <Card variant="danger" padding="md" className="mb-4">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        </Card>
      )}

      {disputed.length > 0 && tab !== "bookings" && (
        <Card variant="danger" padding="md" className="mb-4">
          <button type="button" onClick={() => setTab("bookings")} className="flex w-full items-center gap-2.5 text-left">
            <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
            <span className="text-sm text-ink">
              {disputed.length} booking par complaint darj hai — dekhiye.
            </span>
          </button>
        </Card>
      )}

      {tab === "listings" && (
        <div className="flex flex-col gap-3">
          {listings.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <Store className="mx-auto size-10 text-muted" aria-hidden />
              <p className="mt-3 font-semibold text-ink">Koi listing review ke liye baaki nahi.</p>
            </Card>
          ) : (
            listings.map((l) => (
              <Card key={l.partnerId} padding="lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{l.partnerName}</p>
                    <p className="text-xs text-muted">{l.city}</p>
                  </div>
                  <Link href={`/admin/partners/${l.partnerId}`} className="shrink-0 text-xs text-muted underline">
                    Partner file
                  </Link>
                </div>

                {l.headline && <p className="mt-2 text-sm text-ink">{l.headline}</p>}
                {l.about && <p className="mt-1.5 text-xs leading-relaxed text-muted">{l.about}</p>}

                <div className="mt-3 flex flex-wrap gap-1.5 text-[0.6875rem]">
                  {l.areas.map((a) => (
                    <span key={a} className="rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-muted">
                      {a}
                    </span>
                  ))}
                  {l.languages.map((a) => (
                    <span key={a} className="rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-muted">
                      {a}
                    </span>
                  ))}
                </div>

                <ul className="mt-3 space-y-1.5">
                  {l.services.map((s) => (
                    <li key={s.kind} className="rounded-lg border border-line bg-bg-subtle px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-ink">{s.name}</span>
                        <span className="tabular-nums text-ink">
                          {s.adminPricePaise !== null ? (
                            <>
                              <span className="mr-1.5 text-muted line-through">{rupees(s.priceInPaise)}</span>
                              {s.adminPricePaise === 0 ? "Free" : rupees(s.adminPricePaise)}
                            </>
                          ) : (
                            rupees(s.priceInPaise)
                          )}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[0.6875rem] text-muted">{s.deliverables.join(" · ")}</p>
                      <ServicePriceOverride service={s} />
                    </li>
                  ))}
                </ul>

                <div className="mt-4">
                  <Input
                    placeholder="Reject karne ka reason (approve ke liye zaroori nahi)"
                    value={note[l.partnerId] ?? ""}
                    onChange={(e) => setNote({ ...note, [l.partnerId]: e.target.value })}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    loading={busy === `a-${l.partnerId}`}
                    onClick={() =>
                      post(`/api/admin/partner-listings/${l.partnerId}`, { approve: true }, `a-${l.partnerId}`)
                    }
                    icon={<BadgeCheck className="size-4" />}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === `r-${l.partnerId}`}
                    disabled={!(note[l.partnerId] ?? "").trim()}
                    onClick={() =>
                      post(
                        `/api/admin/partner-listings/${l.partnerId}`,
                        { approve: false, note: note[l.partnerId] },
                        `r-${l.partnerId}`,
                      )
                    }
                  >
                    Reject
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "bookings" && (
        <div className="flex flex-col gap-3">
          {bookings.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <p className="font-semibold text-ink">Abhi koi booking nahi.</p>
            </Card>
          ) : (
            bookings.map((b) => (
              <Card key={b.id} padding="lg" variant={b.status === "DISPUTED" ? "danger" : "default"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{b.serviceName}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {b.buyerName} → {b.partnerName}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-line bg-bg-subtle px-2.5 py-0.5 text-[0.6875rem] font-medium text-muted">
                    {BOOKING_STATUS_LABEL[b.status]}
                  </span>
                </div>

                <p className="mt-2 inline-flex items-center gap-1 text-xs tabular-nums text-muted">
                  <IndianRupee className="size-3.5" aria-hidden />
                  {rupees(b.pricePaise)} · partner {rupees(b.partnerAmountPaise)}
                  {b.allocationStatus ? ` · ${ALLOCATION_STATUS_LABEL[b.allocationStatus]}` : ""}
                </p>

                {b.disputeReason && (
                  <div className="mt-3 rounded-lg border border-danger/25 bg-danger-bg px-3 py-2">
                    <p className="text-[0.6875rem] font-medium text-danger">Complaint</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink">{b.disputeReason}</p>
                  </div>
                )}
                {b.resolutionNote && (
                  <p className="mt-2 text-xs leading-relaxed text-muted">Faisla: {b.resolutionNote}</p>
                )}

                <div className="mt-3">
                  <Input
                    placeholder="Faisle ka reason — audit log me jayega"
                    value={note[b.id] ?? ""}
                    onChange={(e) => setNote({ ...note, [b.id]: e.target.value })}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={(note[b.id] ?? "").trim().length < 3}
                    loading={busy === `rf-${b.id}`}
                    onClick={() =>
                      post(`/api/admin/service-bookings/${b.id}`, { action: "refund", note: note[b.id] }, `rf-${b.id}`)
                    }
                  >
                    Refund Buyer
                  </Button>
                  {b.status === "DISPUTED" && (
                    <Button
                      size="sm"
                      variant="success"
                      disabled={(note[b.id] ?? "").trim().length < 3}
                      loading={busy === `rl-${b.id}`}
                      onClick={() =>
                        post(
                          `/api/admin/service-bookings/${b.id}`,
                          { action: "release", note: note[b.id] },
                          `rl-${b.id}`,
                        )
                      }
                    >
                      Release to Partner
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={(note[b.id] ?? "").trim().length < 3}
                    loading={busy === `n-${b.id}`}
                    onClick={() =>
                      post(`/api/admin/service-bookings/${b.id}`, { action: "note", note: note[b.id] }, `n-${b.id}`)
                    }
                  >
                    Add Note
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "reviews" && (
        <div className="flex flex-col gap-3">
          {reviews.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <Star className="mx-auto size-10 text-muted" aria-hidden />
              <p className="mt-3 font-semibold text-ink">Abhi koi review nahi.</p>
            </Card>
          ) : (
            reviews.map((r) => (
              <Card key={r.id} padding="md" variant={r.hidden ? "soft" : "default"}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">
                    {r.authorFirstName} → {r.partnerName}
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm text-gold-700 dark:text-gold-300">
                    <Star className="size-3.5 fill-current" aria-hidden />
                    {r.rating}
                  </span>
                </div>
                {r.body && <p className="mt-1.5 text-sm leading-relaxed text-muted">{r.body}</p>}
                <div className="mt-2.5 flex items-center gap-2">
                  <Input
                    placeholder="Reason"
                    value={note[r.id] ?? ""}
                    onChange={(e) => setNote({ ...note, [r.id]: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === r.id}
                    disabled={!r.hidden && !(note[r.id] ?? "").trim()}
                    onClick={() =>
                      post(
                        `/api/admin/service-reviews/${r.id}`,
                        { hide: !r.hidden, note: note[r.id] ?? "" },
                        r.id,
                      )
                    }
                    icon={r.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  >
                    {r.hidden ? "Restore" : "Hide"}
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The platform's own price for one partner's service.
 *
 * Separate from the partner's number on screen as well as in the database: the
 * struck-through original stays visible so staff can always see what they are
 * overriding, and clearing the override puts it back exactly.
 *
 * Blank means free. That is spelled out under the field rather than left to be
 * discovered, because "₹0" and "no override" are one keystroke apart and mean
 * opposite things.
 */
function ServicePriceOverride({
  service,
}: {
  service: { id: string; priceInPaise: number; adminPricePaise: number | null; adminPriceNote: string | null };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState(
    service.adminPricePaise === null ? "" : String(Math.round(service.adminPricePaise / 100)),
  );
  const [note, setNote] = useState(service.adminPriceNote ?? "");

  async function save(clear: boolean) {
    if (busy) return;
    if (!clear && note.trim().length < 3) {
      toast({ title: "Wajah likhiye", description: "Partner ko yahi dikhega.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/pricing/marketplace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "service-override",
          serviceId: service.id,
          pricePaise: clear ? null : Math.round(Number(price || 0) * 100),
          note: clear ? "Override hataya gaya" : note.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: "Network error", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-[0.6875rem] text-muted underline underline-offset-2 hover:text-ink"
      >
        {service.adminPricePaise !== null ? "Platform ka daam badliye" : "Platform ka apna daam rakhiye"}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
          className="min-h-9 w-24 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold-500"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          placeholder="Wajah — partner ko dikhegi"
          className="min-h-9 flex-1 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold-500"
        />
      </div>
      <p className="text-[0.6875rem] text-muted">
        0 rakhenge to ye service free ho jayegi — buyer ko payment screen dikhegi hi nahi. Partner ko us booking
        se kamai nahi hogi.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(false)}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-gold-500 disabled:opacity-55"
        >
          Lagayiye
        </button>
        {service.adminPricePaise !== null && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(true)}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-ink disabled:opacity-55"
          >
            Hataiye
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-xs text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
