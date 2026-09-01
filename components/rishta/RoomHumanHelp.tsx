"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Headset, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * "Kisi insaan se baat karni hai" — asked from inside one rishta.
 *
 * ## Why this is here and not only on the plan page
 *
 * `assistedMatchmaker` lived exactly one place: a card on `/user/subscription`,
 * between the invoice history and the plan ladder. That is where somebody goes
 * to *buy*, not where they go when they are stuck — and the moment a person is
 * actually stuck is when they are staring at one rishta wondering what to say
 * next. Asking for help two taps away from the thing you need help with is
 * asking in the abstract, which is why the queue stayed empty.
 *
 * The plan page keeps its card. It is where the capability is *explained*, and
 * deleting it would leave Premium's one human promise undiscoverable until the
 * user happened to open a Room.
 *
 * ## Why the note is prefilled and editable
 *
 * The team on the other end needs to know which rishta this is about; the user
 * should not have to type that. Everything after the first line is theirs — and
 * the box stays open rather than sending silently, because a request that goes
 * to a human should have been read by the person sending it.
 */
export default function RoomHumanHelp({
  personName,
  openRequests,
}: {
  personName: string;
  openRequests: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(`${personName} wale rishtey ke baare me baat karni hai. `);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/matchmaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The person is named in the note, not sent as an id: the queue is an
        // intake list a human reads, not a CRM keyed on candidates, and giving
        // it a foreign key would be the first step to it quietly becoming one.
        body: JSON.stringify({ note: note.trim().slice(0, 500) || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast({ title: "Request nahi bheji ja saki", description: json?.message, tone: "error" });
        return;
      }
      toast({
        title: "Request bhej di",
        description: "Hamari team aapse khud contact karegi.",
        tone: "success",
      });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (openRequests > 0 && !open) {
    return (
      <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
        <Headset className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
        Aapki {openRequests === 1 ? "ek request" : `${openRequests} requests`} team ke paas khuli hai — wo
        khud aapse contact karenge.
      </p>
    );
  }

  return (
    <div>
      <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
        <Headset className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
        Is rishtey par kisi insaan se baat kar sakte hain. Yahan koi AI nahi — hamari team ka koi banda
        aapko call karega.
      </p>

      {open ? (
        <div className="mt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={3}
            className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] leading-relaxed outline-none focus:border-gold-500"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void send()}
              className="rounded-md border border-line px-3 py-2 text-[0.75rem] text-ink hover:border-gold-500 disabled:opacity-55"
            >
              Send request
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-2 text-[0.75rem] text-muted hover:text-ink"
            >
              Cancel
            </button>
            {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-md border border-line px-3 py-2 text-[0.75rem] font-medium text-ink transition-colors hover:border-gold-500"
        >
          Talk to a person
        </button>
      )}
    </div>
  );
}
