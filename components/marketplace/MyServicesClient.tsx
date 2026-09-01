"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BadgeCheck, Check, Clock, MessageSquare, Star,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import {
  BOOKING_STATUS_LABEL,
  MILESTONE_STATUS_LABEL,
  REVIEW_PROMPT,
  rupees,
} from "@/lib/services/marketplace/servicePolicy";
import type { ServiceBookingStatus, ServiceMilestoneStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

export interface MyBookingView {
  id: string;
  status: ServiceBookingStatus;
  pricePaise: number;
  createdAt: string;
  acceptBySla: string | null;
  refundWindowEndsAt: string | null;
  partnerName: string;
  partnerId: string;
  serviceName: string;
  hasReview: boolean;
  milestones: {
    id: string;
    title: string;
    status: ServiceMilestoneStatus;
    submittedNote: string | null;
  }[];
}

export interface MyThreadView {
  id: string;
  partnerId: string;
  partnerName: string;
  lastMessageAt: string;
  unread: number;
  status: string;
}

const STATUS_TONE: Record<ServiceBookingStatus, string> = {
  PENDING_PAYMENT: "border-line bg-bg-subtle text-muted",
  PAID: "border-info/30 bg-info-bg text-info",
  ACCEPTED: "border-gold-300 bg-gold-50 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300",
  IN_PROGRESS: "border-gold-300 bg-gold-50 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300",
  DELIVERED: "border-warn/40 bg-warn-bg text-warn",
  COMPLETED: "border-trust/30 bg-trust-bg text-trust",
  CANCELLED: "border-line bg-bg-subtle text-muted",
  REFUNDED: "border-line bg-bg-subtle text-muted",
  EXPIRED_UNACCEPTED: "border-danger/25 bg-danger-bg text-danger",
  DISPUTED: "border-danger/25 bg-danger-bg text-danger",
};

/**
 * "My Partner Services" — every booking this member has made, and every
 * pre-booking conversation they have open.
 *
 * The action set on each card is derived from the status rather than always
 * rendered and disabled: a Cancel button that is grey on eight cards out of
 * ten teaches people to stop reading the card.
 */
export default function MyServicesClient({
  bookings,
  threads,
}: {
  bookings: MyBookingView[];
  threads: MyThreadView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [disputeText, setDisputeText] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");

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
      setError("Internet nahi mil raha. Dobara koshish kariye.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section>
        <h1 className="text-2xl font-bold text-wine-700">My Partner Services</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Jo services aapne kharidi hain, aur jo baat-cheet chal rahi hai.
        </p>
      </section>

      {error && (
        <Card variant="danger" padding="md">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        </Card>
      )}

      {bookings.length === 0 ? (
        <Card variant="soft" padding="lg" className="text-center">
          <p className="font-semibold text-ink">Abhi koi service nahi li hai.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            Verified partners se madad li ja sakti hai — profile setup, curated shortlist, ya sirf ek intro
            call.
          </p>
          <div className="mt-5">
            <Link href="/partners">
              <Button>Browse Partners</Button>
            </Link>
          </div>
        </Card>
      ) : (
        bookings.map((b) => {
          const pendingMilestones = b.milestones.filter((m) => m.status === "SUBMITTED");
          return (
            <Card key={b.id} padding="lg">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{b.serviceName}</p>
                  <Link href={`/partners/${b.partnerId}`} className="text-xs text-muted hover:text-ink">
                    {b.partnerName}
                  </Link>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-medium",
                    STATUS_TONE[b.status],
                  )}
                >
                  {BOOKING_STATUS_LABEL[b.status]}
                </span>
              </div>

              <p className="mt-2 text-sm tabular-nums text-muted">{rupees(b.pricePaise)}</p>

              {b.status === "PAID" && b.acceptBySla && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-info">
                  <Clock className="size-3.5" aria-hidden />
                  {new Date(b.acceptBySla).toLocaleString("en-IN")} tak accept nahi hua to poora refund.
                </p>
              )}
              {b.status === "DELIVERED" && b.refundWindowEndsAt && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-warn">
                  <Clock className="size-3.5" aria-hidden />
                  {new Date(b.refundWindowEndsAt).toLocaleDateString("en-IN")} tak aap sawaal utha sakte hain.
                </p>
              )}

              {b.milestones.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {b.milestones.map((m) => (
                    <li key={m.id} className="rounded-lg border border-line bg-bg-subtle px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-ink">{m.title}</span>
                        <span className="shrink-0 text-[0.6875rem] text-muted">
                          {MILESTONE_STATUS_LABEL[m.status]}
                        </span>
                      </div>
                      {m.submittedNote && (
                        <p className="mt-1 text-xs leading-relaxed text-muted">{m.submittedNote}</p>
                      )}
                      {m.status === "SUBMITTED" && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => post(`/api/services/milestones/${m.id}`, { action: "accept" }, m.id)}
                            loading={busy === m.id}
                            icon={<Check className="size-4" />}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              post(
                                `/api/services/milestones/${m.id}`,
                                { action: "dispute", note: "Ye poora nahi lag raha — dobara dekh lijiye." },
                                m.id,
                              )
                            }
                            loading={busy === m.id}
                          >
                            Not Done Yet
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {b.status === "PAID" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => post(`/api/services/bookings/${b.id}`, { action: "cancel" }, b.id)}
                    loading={busy === b.id}
                  >
                    Cancel — Full Refund
                  </Button>
                )}
                {b.status === "DELIVERED" && pendingMilestones.length === 0 && (
                  <Button
                    size="sm"
                    onClick={() => post(`/api/services/bookings/${b.id}`, { action: "acknowledge" }, b.id)}
                    loading={busy === b.id}
                    icon={<BadgeCheck className="size-4" />}
                  >
                    Sab Theek Hai
                  </Button>
                )}
                {["ACCEPTED", "IN_PROGRESS", "DELIVERED"].includes(b.status) && (
                  <Button size="sm" variant="ghost" onClick={() => setDisputing(disputing === b.id ? null : b.id)}>
                    Report a Problem
                  </Button>
                )}
                {b.status === "COMPLETED" && !b.hasReview && (
                  <Button size="sm" variant="secondary" onClick={() => setReviewing(reviewing === b.id ? null : b.id)}>
                    Write a Review
                  </Button>
                )}
              </div>

              {disputing === b.id && (
                <div className="mt-3 rounded-lg border border-danger/25 bg-danger-bg p-3">
                  <Textarea
                    value={disputeText}
                    onChange={(e) => setDisputeText(e.target.value)}
                    rows={3}
                    placeholder="Kya dikkat hai? Ek insaan ise padhega."
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busy === `d-${b.id}`}
                      disabled={disputeText.trim().length < 5}
                      onClick={async () => {
                        const ok = await post(
                          `/api/services/bookings/${b.id}`,
                          { action: "dispute", reason: disputeText.trim() },
                          `d-${b.id}`,
                        );
                        if (ok) {
                          setDisputing(null);
                          setDisputeText("");
                        }
                      }}
                    >
                      Submit Complaint
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDisputing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {reviewing === b.id && (
                <div className="mt-3 rounded-lg border border-line bg-bg-subtle p-3">
                  <p className="text-xs leading-relaxed text-muted">{REVIEW_PROMPT}</p>
                  <div className="mt-2 flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        aria-label={`${n} star`}
                        className="touch-target grid size-10 place-items-center"
                      >
                        <Star
                          className={cn(
                            "size-6",
                            n <= rating ? "fill-current text-gold-600" : "text-line-strong",
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={reviewBody}
                    onChange={(e) => setReviewBody(e.target.value)}
                    rows={3}
                    maxLength={700}
                    placeholder="Kaam kaisa raha?"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      loading={busy === `r-${b.id}`}
                      onClick={async () => {
                        const ok = await post(
                          `/api/services/bookings/${b.id}`,
                          { action: "review", rating, body: reviewBody.trim() || undefined },
                          `r-${b.id}`,
                        );
                        if (ok) {
                          setReviewing(null);
                          setReviewBody("");
                        }
                      }}
                    >
                      Post Review
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setReviewing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}

      {threads.length > 0 && (
        <section className="mt-2">
          <h2 className="text-lg font-semibold text-ink">Baat-cheet</h2>
          <div className="mt-3 flex flex-col gap-2.5">
            {threads.map((t) => (
              <Link key={t.id} href={`/partners/${t.partnerId}`} className="block">
                <Card variant="interactive" padding="md">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <MessageSquare className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="truncate text-sm font-medium text-ink">{t.partnerName}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.unread > 0 && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] font-medium text-accent-fg">
                          {t.unread}
                        </span>
                      )}
                      <span className="text-xs text-muted">
                        {new Date(t.lastMessageAt).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Card variant="soft" padding="md">
        <div className="flex gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            Kisi bhi partner ko aapki profile, matches ya chat tak pahunch nahi milti. Wo cheez alag hai —
            <Link href="/user/profile/access" className="ml-1 underline">
              Profile Access
            </Link>{" "}
            par aap khud dete aur hataate hain.
          </p>
        </div>
      </Card>
    </div>
  );
}
