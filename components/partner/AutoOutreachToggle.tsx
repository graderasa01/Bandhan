"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

/**
 * The partner's switch for automatic follow-ups.
 *
 * Phrased as what happens rather than as a feature name — a partner deciding
 * whether to let us message their contacts needs to know exactly what goes
 * out and whose name is on it, and "Auto outreach: ON" tells them neither.
 */
export default function AutoOutreachToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true);
    // Optimistic: the switch has to move the instant it's pressed, and it is
    // reverted below if the write fails.
    setOn(next);
    try {
      const res = await fetch("/api/partner/me/auto-outreach", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      toast({
        title: next ? "Automatic reminder on ho gaye" : "Automatic reminder band ho gaye",
        description: next
          ? "Ruke hue logon ko aapke naam se reminder jaate rahenge."
          : "Ab aap khud hi message bhejenge.",
        tone: "success",
      });
      router.refresh();
    } catch {
      setOn(!next);
      toast({ title: "Save nahi hua — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="soft" padding="md">
      <div className="flex items-start gap-3">
        <Bot className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Automatic reminder</p>
          <p className="mt-0.5 text-sm text-muted">
            Jo log profile adhoori chhod dete hain ya kaafi din se active nahi hain, unhe BandhanTak khud aapke
            naam se WhatsApp ya email reminder bhej dega. Aapka manual bhejna isse band nahi hota.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Automatic reminder"
          onClick={toggle}
          disabled={busy}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            on ? "bg-primary" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
              on ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </Card>
  );
}
