"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";

export type AdminVoiceAccessRow = {
  id: string;
  fullName: string;
  maskedMobile: string | null;
  maskedEmail: string | null;
  status: string;
  reason: string | null;
  requestedAt: string | null;
};

type PendingReject = { userId: string; name: string } | null;

const STATUS_TONE: Record<string, "gold" | "trust" | "danger" | "neutral"> = {
  PENDING: "gold",
  APPROVED: "trust",
  REJECTED: "danger",
};

/**
 * Approve/reject queue for the one exception path in voice profile-fill —
 * see VoiceSelfFillStatus on the User model. Only PENDING rows arrive here;
 * the page itself decides what's worth listing.
 */
export default function VoiceAccessReviewList({ rows }: { rows: AdminVoiceAccessRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reject, setReject] = useState<PendingReject>(null);
  const [note, setNote] = useState("");

  async function run(userId: string, action: "approve" | "reject", withNote?: string) {
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/voice-access/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: withNote }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Action fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: `Status ${json.status} ho gaya`, tone: "success" });
      setReject(null);
      setNote("");
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <Card variant="soft" padding="lg">
        <p className="text-center text-sm text-muted">Koi voice-access request pending nahi hai.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <Card key={r.id} variant="default" padding="md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{r.fullName}</h3>
                  <Pill tone={STATUS_TONE[r.status] ?? "neutral"} size="sm">
                    {r.status}
                  </Pill>
                </div>
                <p className="mt-0.5 text-[0.8125rem] text-subtle">
                  {r.maskedMobile}
                  {r.maskedEmail ? ` · ${r.maskedEmail}` : ""}
                  {r.requestedAt ? ` · ${r.requestedAt}` : ""}
                </p>
                {r.reason && (
                  <p className="mt-2 rounded-md border border-line bg-bg-subtle px-3 py-2 text-[0.8125rem] leading-snug text-ink">
                    &ldquo;{r.reason}&rdquo;
                  </p>
                )}
              </div>

              {r.status === "PENDING" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="success" loading={busyId === r.id} onClick={() => run(r.id, "approve")}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === r.id}
                    onClick={() => setReject({ userId: r.id, name: r.fullName })}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Sheet
        open={reject !== null}
        onClose={() => {
          setReject(null);
          setNote("");
        }}
        title={`${reject?.name} ki request reject karein`}
        description="Note optional hai — internal record ke liye."
        variant="center"
      >
        <div className="space-y-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (optional)…"
            rows={3}
            maxLength={400}
            showCount
          />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="danger"
              size="md"
              fullWidth
              disabled={busyId !== null}
              onClick={() => reject && run(reject.userId, "reject", note.trim() || undefined)}
            >
              Reject karein
            </Button>
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => {
                setReject(null);
                setNote("");
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
