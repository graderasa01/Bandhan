"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import { REASON_MAX, REASON_MIN } from "@/lib/services/partner/constants";
import { useReviewAction } from "@/components/admin/_shared/useReviewAction";
import ReasonSheet from "@/components/admin/_shared/ReasonSheet";
import EmptyReviewState from "@/components/admin/_shared/EmptyReviewState";

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

/**
 * `canReview` is false for SUPPORT (M10 §23). It only decides what renders —
 * the PATCH route runs `requireAdmin()` and 403s SUPPORT regardless, so a
 * hand-crafted request gets nowhere either.
 */
export default function PartnerReviewList({
  partners,
  canReview = true,
}: {
  partners: AdminPartnerRow[];
  canReview?: boolean;
}) {
  const { busyId, run: runAction, toast } = useReviewAction();
  const [review, setReview] = useState<PendingReview>(null);
  const [reason, setReason] = useState("");

  async function run(partnerId: string, action: string, withReason?: string) {
    await runAction(partnerId, `/api/admin/partners/${partnerId}`, { action, reason: withReason }, (json) => {
      toast({
        title: `Status ${json.status} ho gaya`,
        description: json.issuedCode ? `Referral code: ${json.issuedCode}` : undefined,
        tone: "success",
      });
      setReview(null);
      setReason("");
    });
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
    return <EmptyReviewState message="Koi partner applications nahi hain." />;
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
                {canReview && p.status === "PENDING_APPROVAL" && (
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
                {canReview && (p.status === "APPROVED" || p.status === "ACTIVE") && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === p.id}
                    onClick={() => start(p.id, "suspend", p.fullName)}
                  >
                    Suspend
                  </Button>
                )}
                {canReview && p.status === "SUSPENDED" && (
                  <Button size="sm" variant="secondary" loading={busyId === p.id} onClick={() => run(p.id, "reactivate")}>
                    Reactivate
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <ReasonSheet
        open={review !== null}
        onClose={() => {
          setReview(null);
          setReason("");
        }}
        title={review?.action === "reject" ? `${review?.name} ko reject karein` : `${review?.name} ko suspend karein`}
        description="Reason zaroori hai — partner ko iska saaf-suthra version dikhaya jayega."
        value={reason}
        onChange={setReason}
        placeholder="Reason likhiye…"
        maxLength={REASON_MAX}
        helperText={`Kam se kam ${REASON_MIN} characters. Internal words (fraud, suspicious, high risk, blacklist) partner ko nahi dikhte.`}
        confirmLabel={review?.action === "reject" ? "Reject" : "Suspend"}
        confirmDisabled={!reasonValid}
        busy={busyId !== null}
        onConfirm={() => review && run(review.partnerId, review.action, reason.trim())}
      />
    </>
  );
}
