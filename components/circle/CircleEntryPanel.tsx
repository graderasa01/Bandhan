"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { MARRIAGE_TIMELINE_OPTIONS } from "@/lib/circle/eligibility";
import type { CircleView } from "@/lib/services/circle/circleService";

/**
 * The gate checklist plus the one CTA it unlocks.
 *
 * Rendered as a *checklist*, never as a yes/no. A user told "aap eligible
 * nahi hain" learns nothing and leaves; a user shown "3 of 4 ho gaya, bas
 * family member add karna hai" finishes the fourth — and finishing the fourth
 * is itself the behaviour worth having, whether or not they ever attend.
 */
export default function CircleEntryPanel({ view }: { view: CircleView }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const { eligibility, event, myEntryStatus, marriageTimeline } = view;
  const registered = myEntryStatus === "REGISTERED" || myEntryStatus === "CONFIRMED";
  const closed = event === null || event.status !== "SCHEDULED";

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Nahi ho paya", description: json.message ?? "Please try again.", tone: "error" });
        return;
      }
      router.refresh();
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      padding="md"
      className="mb-4 border border-gold-400/60 bg-gradient-to-br from-wine-700 to-wine-800 text-white shadow-lg"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.75rem] font-medium uppercase tracking-wide text-gold-200">Entry ke liye</p>
        <p className="text-[0.75rem] text-white/70">
          {eligibility.passedCount} / {eligibility.totalCount} ho gaya
        </p>
      </div>

      <ul className="mt-3 space-y-2.5">
        {eligibility.gates.map((gate) => (
          <li key={gate.key} className="flex items-start gap-2.5">
            <span
              className={
                gate.passed
                  ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-trust"
                  : "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60"
              }
            >
              {gate.passed ? <Check className="size-3.5" /> : <Lock className="size-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={gate.passed ? "text-[0.875rem] text-white/50 line-through" : "text-[0.875rem] text-white"}>
                {gate.label}
              </p>
              {!gate.passed && gate.todo && <p className="mt-0.5 text-[0.8125rem] text-white/70">{gate.todo}</p>}
              {!gate.passed && gate.href && gate.key !== "timeline" && (
                <Link
                  href={gate.href}
                  className="mt-1 inline-block text-[0.8125rem] font-semibold text-gold-300 underline underline-offset-2"
                >
                  {gate.ctaLabel}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {marriageTimeline === null && (
        <div className="mt-4 rounded-md border border-white/15 bg-white/[0.08] p-3 backdrop-blur-sm">
          <p className="text-[0.8125rem] font-medium text-white">Shaadi kab tak karni hai?</p>
          <p className="mt-0.5 text-[0.75rem] text-white/70">
            Ye sirf Circle ke liye hai — profile par kisi ko nahi dikhta.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {MARRIAGE_TIMELINE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={busy}
                onClick={() => post({ action: "timeline", timeline: opt.value })}
                className="rounded-full border border-white/25 bg-white/10 px-3.5 py-2 text-[0.8125rem] font-medium text-white transition-colors hover:border-gold-300 hover:bg-white/20 disabled:opacity-45"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        {registered ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[0.8125rem] font-semibold text-trust">
              <Check className="size-4" />
              {myEntryStatus === "CONFIRMED" ? "Seat pakki" : "Naam laga hua hai"}
            </span>
            {!closed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => post({ action: "withdraw" })}
                className="text-[0.8125rem] text-white/70 underline underline-offset-2 disabled:opacity-45"
              >
                Withdraw
              </button>
            )}
          </div>
        ) : myEntryStatus === "WAITLISTED" ? (
          <p className="text-[0.875rem] text-white/70">
            Is baar waiting list me hain — seats balance karne ke liye. Agle Circle me aapka number pehle hai.
          </p>
        ) : closed ? (
          <p className="text-[0.875rem] text-white/70">Is Circle ka registration band ho chuka hai.</p>
        ) : (
          <Button
            variant="primary"
            size="md"
            disabled={!eligibility.eligible || busy}
            onClick={() => post({ action: "register" })}
            className="w-full sm:w-auto"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Reserve my seat
          </Button>
        )}
      </div>
    </Card>
  );
}
