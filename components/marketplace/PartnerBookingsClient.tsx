"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, IndianRupee, Send, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import {
  ALLOCATION_STATUS_LABEL,
  BOOKING_STATUS_LABEL,
  MILESTONE_STATUS_LABEL,
  rupees,
} from "@/lib/services/marketplace/servicePolicy";
import type { ServiceAllocationStatus, ServiceBookingStatus, ServiceMilestoneStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

export interface PartnerBookingView {
  id: string;
  status: ServiceBookingStatus;
  serviceName: string;
  buyerFirstName: string;
  pricePaise: number;
  partnerAmountPaise: number;
  allocationStatus: ServiceAllocationStatus | null;
  acceptBySla: string | null;
  buyerNote: string | null;
  preferredSlots: string | null;
  createdAt: string;
  disputeReason: string | null;
  milestones: { id: string; title: string; status: ServiceMilestoneStatus; submittedNote: string | null }[];
}

/**
 * The partner's booking desk.
 *
 * Two deliberate absences on every card:
 *
 * - **The buyer's full name.** First name only. A partner delivering a curated
 *   shortlist does not need the member's full identity, and a booking list is
 *   the least defensible place to hand it over.
 * - **Any contact detail.** Coordination happens in the enquiry thread, which
 *   is scrubbed. A booking is not a contact reveal.
 *
 * What *is* shown loudly is the acceptance clock, because missing it costs the
 * partner the whole booking.
 */
export default function PartnerBookingsClient({ bookings }: { bookings: PartnerBookingView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [declineText, setDeclineText] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitNote, setSubmitNote] = useState("");

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
        setError(data.message ?? "Ye action poora nahi hua.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Internet nahi mil raha.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const waiting = bookings.filter((b) => b.status === "PAID");
  const active = bookings.filter((b) => ["ACCEPTED", "IN_PROGRESS", "DELIVERED", "DISPUTED"].includes(b.status));
  const done = bookings.filter((b) => !waiting.includes(b) && !active.includes(b));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section>
        <h1 className="text-2xl font-bold text-wine-700">Bookings</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Jo log aapki service kharid chuke hain. Paisa BandhanTak ke paas rukha hai — kaam poora hone par
          aapke balance me aata hai.
        </p>
      </section>

      {error && (
        <Card variant="danger" padding="md">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        </Card>
      )}

      {bookings.length === 0 && (
        <Card variant="soft" padding="lg" className="text-center">
          <p className="font-semibold text-ink">Abhi koi booking nahi.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            My Listing par apni services aur keemat daal kar marketplace par dikhna shuru kariye.
          </p>
        </Card>
      )}

      {[
        { title: "Accept karna baaki", rows: waiting },
        { title: "Chal rahi hain", rows: active },
        { title: "Poori ho chuki", rows: done },
      ]
        .filter((g) => g.rows.length > 0)
        .map((group) => (
          <section key={group.title}>
            <h2 className="mb-2 text-base font-semibold text-ink">
              {group.title} ({group.rows.length})
            </h2>
            <div className="flex flex-col gap-3">
              {group.rows.map((b) => (
                <Card key={b.id} padding="lg">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{b.serviceName}</p>
                      <p className="mt-0.5 text-xs text-muted">{b.buyerFirstName} ke liye</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-line bg-bg-subtle px-2.5 py-0.5 text-[0.6875rem] font-medium text-muted">
                      {BOOKING_STATUS_LABEL[b.status]}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <IndianRupee className="size-3.5" aria-hidden />
                      Aapko {rupees(b.partnerAmountPaise)} (total {rupees(b.pricePaise)})
                    </span>
                    {b.allocationStatus && <span>{ALLOCATION_STATUS_LABEL[b.allocationStatus]}</span>}
                  </div>

                  {b.status === "PAID" && b.acceptBySla && (
                    <p
                      className={cn(
                        "mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs",
                        new Date(b.acceptBySla).getTime() - Date.now() < 6 * 3_600_000
                          ? "border border-danger/25 bg-danger-bg text-danger"
                          : "border border-info/30 bg-info-bg text-info",
                      )}
                    >
                      <Clock className="size-3.5" aria-hidden />
                      {new Date(b.acceptBySla).toLocaleString("en-IN")} tak accept kariye — nahi to booking
                      apne aap cancel aur refund ho jayegi.
                    </p>
                  )}

                  {b.buyerNote && (
                    <div className="mt-3 rounded-lg border border-line bg-bg-subtle px-3 py-2">
                      <p className="text-[0.6875rem] font-medium text-muted">Unhone likha</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink">{b.buyerNote}</p>
                      {b.preferredSlots && (
                        <p className="mt-1.5 text-xs text-muted">Free time: {b.preferredSlots}</p>
                      )}
                    </div>
                  )}

                  {b.disputeReason && (
                    <div className="mt-3 rounded-lg border border-danger/25 bg-danger-bg px-3 py-2">
                      <p className="text-[0.6875rem] font-medium text-danger">Client ki complaint</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink">{b.disputeReason}</p>
                    </div>
                  )}

                  {b.milestones.length > 0 && ["ACCEPTED", "IN_PROGRESS", "DELIVERED", "DISPUTED"].includes(b.status) && (
                    <ul className="mt-3 space-y-2">
                      {b.milestones.map((m) => (
                        <li key={m.id} className="rounded-lg border border-line bg-bg-subtle px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-ink">{m.title}</span>
                            <span className="shrink-0 text-[0.6875rem] text-muted">
                              {MILESTONE_STATUS_LABEL[m.status]}
                            </span>
                          </div>
                          {m.status !== "ACCEPTED" && (
                            <>
                              {submitting === m.id ? (
                                <div className="mt-2">
                                  <Textarea
                                    value={submitNote}
                                    onChange={(e) => setSubmitNote(e.target.value)}
                                    rows={2}
                                    maxLength={800}
                                    placeholder="Kya kiya? Client ko yahi dikhega."
                                  />
                                  <div className="mt-2 flex gap-2">
                                    <Button
                                      size="sm"
                                      loading={busy === m.id}
                                      onClick={async () => {
                                        const ok = await post(
                                          `/api/partner/milestones/${m.id}`,
                                          { note: submitNote.trim() || null },
                                          m.id,
                                        );
                                        if (ok) {
                                          setSubmitting(null);
                                          setSubmitNote("");
                                        }
                                      }}
                                    >
                                      Submit
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setSubmitting(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="mt-2"
                                  onClick={() => {
                                    setSubmitting(m.id);
                                    setSubmitNote("");
                                  }}
                                  icon={<Send className="size-4" />}
                                >
                                  {m.status === "SUBMITTED" ? "Re-submit" : "Mark Done"}
                                </Button>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {b.status === "PAID" && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => post(`/api/partner/bookings/${b.id}`, { action: "accept" }, b.id)}
                        loading={busy === b.id}
                        icon={<CheckCircle2 className="size-4" />}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeclining(declining === b.id ? null : b.id)}
                        icon={<X className="size-4" />}
                      >
                        Decline
                      </Button>
                    </div>
                  )}

                  {declining === b.id && (
                    <div className="mt-3 rounded-lg border border-line bg-bg-subtle p-3">
                      <Textarea
                        value={declineText}
                        onChange={(e) => setDeclineText(e.target.value)}
                        rows={2}
                        placeholder="Kyun nahi le paa rahe? Client ko ye dikhega."
                      />
                      <p className="mt-1 text-[0.6875rem] text-muted">Decline karne par poora paisa wapas jaata hai.</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={declineText.trim().length < 5}
                          loading={busy === `dec-${b.id}`}
                          onClick={async () => {
                            const ok = await post(
                              `/api/partner/bookings/${b.id}`,
                              { action: "decline", reason: declineText.trim() },
                              `dec-${b.id}`,
                            );
                            if (ok) {
                              setDeclining(null);
                              setDeclineText("");
                            }
                          }}
                        >
                          Confirm Decline
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
