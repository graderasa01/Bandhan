"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { Checkbox, Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { REPORT_REASONS } from "@/lib/constants/reportReasons";

/**
 * Report, with blocking on by default.
 *
 * The checkbox starts checked because the common case is "make this stop" and
 * nobody should have to wait for a review to get that. Unchecking is allowed —
 * a user reporting a fake profile they never interacted with has no reason to
 * block anyone.
 *
 * There is a separate block-only path (the caller's own button) so that
 * stopping contact never requires accusing someone first. Forcing a report in
 * order to get a block is how platforms end up with a queue full of "just make
 * it stop" and no idea which reports are real.
 */
export default function ReportSheet({
  open,
  onClose,
  targetUserId,
  targetProfileId,
  targetLabel,
  targetType = "PROFILE",
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetUserId?: string;
  targetProfileId?: string;
  targetLabel: string;
  targetType?: "VOICE_NOTE" | "PROFILE" | "MESSAGE" | "QUESTION";
  targetId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report",
          userId: targetUserId,
          profileId: targetProfileId,
          reason,
          details: details.trim() || undefined,
          targetType,
          targetId,
          alsoBlock,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Report nahi bheji ja saki", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Shukriya", description: json.message, tone: "success" });
      onClose();
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Report" variant="bottom">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2.5">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-[0.8125rem] leading-snug text-warn">
            {targetLabel} ke baare me report. Hamari team isse padhegi — aapka naam unhe nahi dikhega.
          </p>
        </div>

        <Select
          aria-label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={REPORT_REASONS.map((r) => ({ value: r, label: r }))}
        />

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
          placeholder="Kuch aur batana chahein to yahan likhein (optional)"
          rows={3}
          className="w-full resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
        />

        <Checkbox
          checked={alsoBlock}
          onChange={(e) => setAlsoBlock(e.target.checked)}
          label="Also block them"
          description="Block karne par ye aapko kuch nahi bhej payenge aur na hi aapki profile dekh payenge."
        />

        <div className="mt-1 flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="primary" size="md" fullWidth disabled={busy} onClick={submit}>
            Send Report
          </Button>
          <Button variant="ghost" size="md" fullWidth disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
