"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Headset } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export interface MatchmakerRequestSummary {
  id: string;
  status: "OPEN" | "CONTACTED" | "RESOLVED";
  createdAt: string;
}

const STATUS_LABEL: Record<MatchmakerRequestSummary["status"], string> = {
  OPEN: "Request bhej di gayi",
  CONTACTED: "Team ne contact kiya",
  RESOLVED: "Poora hua",
};

/**
 * D-11's `assistedMatchmaker` — PREMIUM's one human-in-the-loop capability
 * (D-32: this is intentionally the one place in the app where a person, not a
 * model, is what's being promised). Only rendered for entitled users; the API
 * re-checks anyway, same defense-in-depth as every other gated route here.
 */
export default function MatchmakerRequestCard({ requests }: { requests: MatchmakerRequestSummary[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const openCount = requests.filter((r) => r.status !== "RESOLVED").length;

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/matchmaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Request nahi bheji ja saki", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Request bhej di", description: "Hamari team jald aapse contact karegi.", tone: "success" });
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="soft" padding="lg" className="mt-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg">
          <Headset className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-ink">Talk to a Matchmaker</p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            Hamari team aapki profile dekh kar personally madad karegi — koi AI nahi, ek insaan.
          </p>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="Kis cheez me madad chahiye? (optional)"
            rows={2}
            className="mt-3 w-full resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.875rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
          />

          <Button variant="primary" size="sm" disabled={busy} onClick={submit} className="mt-2">
            Request a Call
          </Button>

          {requests.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
              {requests.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-center justify-between text-[0.75rem] text-muted">
                  <span>{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  <span className={r.status === "RESOLVED" ? "text-trust" : "text-gold-700"}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {openCount >= 3 && (
            <p className="mt-2 text-[0.75rem] text-warn">Aapki 3 requests already khuli hain.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
