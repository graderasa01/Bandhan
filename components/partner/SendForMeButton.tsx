"use client";

import { useState } from "react";
import { Check, Loader2, Mail, Send } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * "BandhanTak se bhejein" — the partner asks us to send the follow-up rather
 * than sending it from their own phone.
 *
 * Sits beside the existing self-send `wa.me` link rather than replacing it.
 * The self-send is still the better message when a partner is willing: it
 * arrives from a person the family already knows. This is for the partner who
 * doesn't have the number saved, or simply won't do it.
 *
 * Once sent, the button stays in its sent state for the rest of the page's
 * life rather than resetting. A partner who taps twice because nothing
 * visibly changed is the exact failure this is meant to avoid — and the
 * server's cooldown wouldn't stop it, since manual sends deliberately bypass
 * that.
 */
export default function SendForMeButton({
  leadId,
  channel,
  label,
}: {
  leadId: string;
  channel: "WHATSAPP" | "EMAIL";
  label: string;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function send() {
    if (state !== "idle") return;
    setState("sending");
    try {
      const res = await fetch(`/api/partner/leads/${leadId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        toast({
          title: "Bheja nahi ja saka",
          description: json?.message ?? "Thodi der me dobara try karein.",
          tone: "error",
        });
        setState("idle");
        return;
      }

      toast({
        title: channel === "EMAIL" ? "Email bhej diya" : "WhatsApp message bhej diya",
        description: "Aapke naam se bheja gaya hai.",
        tone: "success",
      });
      setState("sent");
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
      setState("idle");
    }
  }

  const Icon = state === "sent" ? Check : state === "sending" ? Loader2 : channel === "EMAIL" ? Mail : Send;

  return (
    <button
      type="button"
      onClick={send}
      disabled={state !== "idle"}
      className="inline-flex min-h-8 items-center gap-1 text-[0.6875rem] font-semibold text-primary-text underline underline-offset-2 disabled:no-underline disabled:opacity-70"
    >
      <Icon className={`size-3 ${state === "sending" ? "animate-spin" : ""}`} />
      {state === "sent" ? "Bhej diya" : label}
    </button>
  );
}
