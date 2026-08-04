"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";

export type MatchmakerQueueItem = {
  id: string;
  userName: string;
  note: string | null;
  status: "OPEN" | "CONTACTED";
  createdAt: string;
};

export default function MatchmakerQueue({ items }: { items: MatchmakerQueueItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(requestId: string, status: "CONTACTED" | "RESOLVED") {
    setBusy(requestId);
    try {
      const res = await fetch("/api/admin/matchmaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Failed", description: json.message, tone: "error" });
        return;
      }
      toast({ title: status === "CONTACTED" ? "Marked Contacted" : "Marked Resolved", tone: "success" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted">Koi khuli request nahi hai.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id}>
          <Card padding="md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[0.9375rem] font-semibold text-ink">{r.userName}</p>
                  <Pill tone={r.status === "OPEN" ? "gold" : "trust"} size="sm">
                    {r.status}
                  </Pill>
                </div>
                {r.note && <p className="mt-1 text-[0.8125rem] text-muted">{r.note}</p>}
                <p className="mt-1 text-[0.6875rem] text-subtle">
                  {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                {r.status === "OPEN" && (
                  <Button variant="secondary" size="sm" disabled={busy === r.id} onClick={() => act(r.id, "CONTACTED")}>
                    Mark Contacted
                  </Button>
                )}
                <Button variant="primary" size="sm" disabled={busy === r.id} onClick={() => act(r.id, "RESOLVED")}>
                  Mark Resolved
                </Button>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
