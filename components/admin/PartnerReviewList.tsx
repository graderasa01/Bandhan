"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { REASON_MAX, REASON_MIN } from "@/lib/services/partner/constants";

export type AdminPartnerRow = {
  id: string;
  fullName: string;
  maskedMobile: string;
  maskedEmail: string | null;
  city: string;
  state: string;
  partnerType: string;
  organizationName: string | null;
  experienceYears: number | null;
  status: string;
  appliedAt: string;
  activeCode: string | null;
};

type ReviewAction = "approve" | "reject" | "suspend";
type PendingReview = { partnerId: string; action: ReviewAction; name: string } | null;

/** Reason is required for reject/suspend; approve just needs a yes/no. */
const NEEDS_REASON: Record<ReviewAction, boolean> = { approve: false, reject: true, suspend: true };

const STATUS_TONE: Record<string, "gold" | "trust" | "danger" | "neutral"> = {
  PENDING_APPROVAL: "gold",
  APPROVED: "trust",
  ACTIVE: "trust",
  REJECTED: "danger",
  SUSPENDED: "danger",
  INACTIVE: "neutral",
};

export default function PartnerReviewList({ partners }: { partners: AdminPartnerRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [review, setReview] = useState<PendingReview>(null);
  const [reason, setReason] = useState("");

  async function run(partnerId: string, action: string, withReason?: string) {
    setBusyId(partnerId);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: withReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Action fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: `Status ${json.status} ho gaya`,
        description: json.issuedCode ? `Referral code: ${json.issuedCode}` : undefined,
        tone: "success",
      });
      setReview(null);
      setReason("");
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Reject and suspend take something away, so they collect a reason first.
   * Approve doesn't — routing it through the reason sheet showed an admin a
   * dialog titled "suspend karein" while they were approving someone.
   */
  function start(partnerId: string, action: ReviewAction, name: string) {
    if (NEEDS_REASON[action]) {
      setReview({ partnerId, action, name });
      return;
    }
    run(partnerId, action);
  }

  if (partners.length === 0) {
    return (
      <Card variant="soft" padding="lg">
        <p className="text-center text-sm text-muted">Koi partner applications nahi hain.</p>
      </Card>
    );
  }

  const reasonValid = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  return (
    <>
      <div className="flex flex-col gap-3">
        {partners.map((p) => (
          <Card key={p.id} variant="default" padding="md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{p.fullName}</h3>
                  <Pill tone={STATUS_TONE[p.status] ?? "neutral"} size="sm">
                    {p.status}
                  </Pill>
                  {p.activeCode && (
                    <Pill tone="gold" size="sm">
                      {p.activeCode}
                    </Pill>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {p.partnerType} · {p.city}, {p.state}
                  {p.organizationName ? ` · ${p.organizationName}` : ""}
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-subtle">
                  {p.maskedMobile}
                  {p.maskedEmail ? ` · ${p.maskedEmail}` : ""}
                  {p.experienceYears != null ? ` · ${p.experienceYears} saal experience` : ""}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-subtle">Applied {p.appliedAt}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {p.status === "PENDING_APPROVAL" && (
                  <>
                    <Button
                      size="sm"
                      variant="success"
                      loading={busyId === p.id}
                      onClick={() => start(p.id, "approve", p.fullName)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === p.id}
                      onClick={() => start(p.id, "reject", p.fullName)}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {(p.status === "APPROVED" || p.status === "ACTIVE") && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === p.id}
                    onClick={() => start(p.id, "suspend", p.fullName)}
                  >
                    Suspend
                  </Button>
                )}
                {p.status === "SUSPENDED" && (
                  <Button size="sm" variant="secondary" loading={busyId === p.id} onClick={() => run(p.id, "reactivate")}>
                    Reactivate
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Sheet
        open={review !== null}
        onClose={() => {
          setReview(null);
          setReason("");
        }}
        title={review?.action === "reject" ? `${review?.name} ko reject karein` : `${review?.name} ko suspend karein`}
        description="Reason zaroori hai — partner ko iska saaf-suthra version dikhaya jayega."
        variant="center"
      >
        <div className="space-y-3">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason likhiye…"
            rows={4}
            maxLength={REASON_MAX}
            showCount
          />
          <p className="text-[0.6875rem] text-subtle">
            Kam se kam {REASON_MIN} characters. Internal words (fraud, suspicious, high risk, blacklist) partner ko
            nahi dikhte.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="danger"
              size="md"
              fullWidth
              disabled={!reasonValid || busyId !== null}
              onClick={() => review && run(review.partnerId, review.action, reason.trim())}
            >
              {review?.action === "reject" ? "Reject karein" : "Suspend karein"}
            </Button>
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => {
                setReview(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
