"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

/**
 * Records a refund an admin already made in Razorpay. It moves no money — the
 * note (the gateway's refund id) is the trace of who did it and where.
 */
export default function SpotlightRefundButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function mark() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/spotlight/${campaignId}/refunded`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Could not save", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Marked refunded", tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Razorpay refund id / note"
        aria-label="Refund note"
        className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-600"
      />
      <button
        type="button"
        onClick={mark}
        disabled={busy || note.trim().length < 3}
        className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-gold-500 disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? "Saving…" : "Mark Refunded"}
      </button>
    </div>
  );
}
