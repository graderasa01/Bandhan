"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Admin-only kill switch for the manual photo review queue. Off: every new
 * upload (and re-approved AI enhance) is created straight as APPROVED — no
 * admin click needed before a profile can join the Reel. On: back to normal
 * — new uploads sit PENDING until someone here reviews them.
 */
export default function PhotoVerificationToggle({ required }: { required: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function flip() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/verification-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoVerificationRequired: !required }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Update fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: required ? "Photo verification band kar di" : "Photo verification wapas zaroori kar di",
        tone: "success",
      });
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant={required ? "soft" : "warning"} padding="md" className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {required ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" />
        ) : (
          <ShieldOff className="mt-0.5 size-4 shrink-0 text-warn" />
        )}
        <div>
          <p className="text-sm font-semibold text-ink">
            {required ? "Photo verification zaroori hai" : "Photo verification band hai"}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            {required
              ? "Naye photo uploads pehle is queue me review ke liye aate hain."
              : "Naye photo uploads bina review ke seedhe approved ho rahe hain aur turant Reel me aa sakte hain."}
          </p>
        </div>
      </div>
      <Button
        variant={required ? "danger" : "secondary"}
        size="sm"
        loading={busy}
        onClick={flip}
      >
        {required ? "Turn Off" : "Turn On"}
      </Button>
    </Card>
  );
}
