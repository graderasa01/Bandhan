"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Phone, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { ContactShareState } from "@/lib/services/match/contactShare";

/**
 * Four states, each said plainly. The one that matters most is "aapne haan kar
 * di, unka jawab baaki hai" — without it the button would look broken to the
 * person who already agreed, and they'd press it again wondering why nothing
 * happened.
 */
export default function ContactShareCard({
  matchId,
  state,
  otherName,
}: {
  matchId: string;
  state: ContactShareState;
  otherName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function act(method: "POST" | "DELETE") {
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/contact`, { method });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Ho nahi paaya", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: method === "POST" ? "Aapki haan darj ho gayi" : "Aapne wapas le liya",
        tone: "success",
      });
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (state.unlocked) {
    return (
      <Card variant="trust" padding="md" className="mb-3">
        <div className="flex items-start gap-3">
          <span className="mt-px grid size-8 shrink-0 place-items-center rounded-full bg-trust/15 text-trust">
            <Phone className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.875rem] font-semibold text-ink">
              {otherName} ka number
            </p>
            <p className="mt-0.5 text-lg font-bold tracking-wide text-ink">
              {state.theirMobile ?? "Number available nahi hai"}
            </p>
            <p className="mt-1 text-[0.75rem] text-muted">
              Dono ne haan ki thi. Aap apni haan wapas le sakte hain, par jo number dikh chuka hai wo
              wapas nahi liya ja sakta.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => act("DELETE")}
              className="mt-2 text-[0.75rem] font-medium text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
            >
              Withdraw Consent
            </button>
          </div>
        </div>
      </Card>
    );
  }

  // Waiting on the other side is a long-lived state — it can sit unchanged
  // for days, so it gets a slim strip instead of a full card competing with
  // the actual conversation every time the thread opens.
  if (state.iAgreed) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-md border border-line bg-bg-subtle px-3 py-2">
        <Check className="size-3.5 shrink-0 text-trust" />
        <p className="min-w-0 flex-1 truncate text-[0.75rem] text-muted">
          Aapki haan darj hai — {otherName} ka jawab baaki hai
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("DELETE")}
          className="shrink-0 text-[0.75rem] font-medium text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
        >
          Withdraw
        </button>
      </div>
    );
  }

  return (
    <Card variant="soft" padding="md" className="mb-3">
      <div className="flex items-start gap-3">
        <span className="mt-px grid size-8 shrink-0 place-items-center rounded-full bg-bg-subtle text-muted">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-semibold text-ink">Number share karein?</p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            {state.theyAgreed
              ? `${otherName} apna number share karne ko taiyaar hain. Aap haan karenge to dono ko number dikh jayega.`
              : "Dono taraf se haan hone par hi number dikhta hai. Tab tak baat yahin chat me hoti hai."}
          </p>

          <div className="mt-3">
            <Button
              size="sm"
              variant="secondary"
              icon={<Phone className="size-4" />}
              loading={busy}
              onClick={() => act("POST")}
            >
              Yes, Share My Number
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
