"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import { REASON_MAX, REASON_MIN } from "@/lib/services/partner/constants";
import type { PendingPhotoRow } from "@/lib/services/verification/photoReviewService";
import { useReviewAction } from "@/components/admin/_shared/useReviewAction";
import ReasonSheet from "@/components/admin/_shared/ReasonSheet";
import EmptyReviewState from "@/components/admin/_shared/EmptyReviewState";

const STATUS_TONE: Record<string, "gold" | "trust" | "danger"> = {
  PENDING: "gold",
  APPROVED: "trust",
  REJECTED: "danger",
};

/**
 * Reviewing a face is a judgement call, so the photo is shown large enough to
 * actually make one — a 40px thumbnail would turn this into rubber-stamping.
 */
export default function PhotoReviewQueue({
  pending,
  decided,
}: {
  pending: PendingPhotoRow[];
  decided: PendingPhotoRow[];
}) {
  const { busyId, run: runAction, toast } = useReviewAction();
  const [rejecting, setRejecting] = useState<PendingPhotoRow | null>(null);
  const [reason, setReason] = useState("");

  async function run(photoId: string, action: "approve" | "reject", withReason?: string) {
    await runAction(photoId, `/api/admin/photos/${photoId}`, { action, reason: withReason }, (json) => {
      toast({ title: `Photo ${json.status} ho gayi`, tone: "success" });
      setRejecting(null);
      setReason("");
    });
  }

  const reasonValid = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  return (
    <>
      {pending.length === 0 ? (
        <EmptyReviewState message="Koi photo review ke liye pending nahi hai. Queue khaali hai." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pending.map((p) => (
            <Card key={p.id} variant="default" padding="md">
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known */}
                <img
                  src={p.fileUrl}
                  alt={`${p.displayName} ki photo`}
                  className="size-28 shrink-0 rounded-md border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="truncate font-semibold text-ink">{p.displayName}</h3>
                    {p.isPrimary && (
                      <Pill tone="gold" size="sm">
                        Primary
                      </Pill>
                    )}
                    {p.priority && (
                      <Pill tone="trust" size="sm">
                        Priority
                      </Pill>
                    )}
                  </div>
                  <p className="mt-0.5 text-[0.8125rem] text-muted">
                    {p.city ?? "City nahi bhari"} · {p.profileStatus}
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] text-subtle">Uploaded {p.uploadedAt}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="success" loading={busyId === p.id} onClick={() => run(p.id, "approve")}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === p.id}
                      onClick={() => {
                        setRejecting(p);
                        setReason("");
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
            Haal hi me decide ki gayi
          </h2>
          <div className="flex flex-col gap-2">
            {decided.map((p) => (
              <Card key={p.id} variant="soft" padding="sm">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known */}
                  <img
                    src={p.fileUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-full border border-line object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{p.displayName}</span>
                    {p.rejectedReason && (
                      <span className="block truncate text-[0.75rem] text-muted">{p.rejectedReason}</span>
                    )}
                  </span>
                  <Pill tone={STATUS_TONE[p.verificationStatus] ?? "neutral"} size="sm">
                    {p.verificationStatus}
                  </Pill>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <ReasonSheet
        open={rejecting !== null}
        onClose={() => {
          setRejecting(null);
          setReason("");
        }}
        title={`${rejecting?.displayName ?? ""} ki photo reject karein`}
        description="Reason zaroori hai — user ko yahi dikhaya jayega taaki wo sahi photo daal sake."
        value={reason}
        onChange={setReason}
        placeholder="Jaise: Chehra saaf nahi dikh raha — ek clear front-facing photo daaliye."
        maxLength={REASON_MAX}
        helperText={`Kam se kam ${REASON_MIN} characters.`}
        confirmLabel="Reject"
        confirmDisabled={!reasonValid}
        busy={busyId !== null}
        onConfirm={() => rejecting && run(rejecting.id, "reject", reason.trim())}
      />
    </>
  );
}
