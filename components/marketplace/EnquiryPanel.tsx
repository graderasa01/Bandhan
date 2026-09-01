"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info, PhoneCall, Send, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import { ENQUIRY_REDACTION_NOTE, MAX_ENQUIRY_MESSAGE_CHARS } from "@/lib/services/marketplace/servicePolicy";
import { cn } from "@/lib/utils";

interface ThreadMessage {
  id: string;
  author: "USER" | "PARTNER";
  body: string;
  redacted: boolean;
  createdAt: string;
}

/**
 * Pre-booking questions, on the platform.
 *
 * The redaction notice sits above the box rather than appearing only after
 * something is stripped — being told the rule before you break it is the
 * difference between a boundary and a trap. When the server does strip
 * something, the panel says so plainly, because a message that silently lost
 * its phone number reads like a bug.
 */
export default function EnquiryPanel({
  partnerId,
  partnerName,
  signedIn,
  returnTo,
}: {
  partnerId: string;
  partnerName: string;
  signedIn: boolean;
  returnTo: string;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redactedNotice, setRedactedNotice] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/partners/${partnerId}/enquiry`);
        if (res.ok) {
          const data = (await res.json()) as { thread: { messages: ThreadMessage[] } | null };
          if (!cancelled) setMessages(data.thread?.messages ?? []);
        }
      } catch {
        /* offline — an empty thread with a working composer is the useful state */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId, signedIn]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(requestCall: boolean) {
    const text = requestCall && !body.trim() ? "Kya hum baat kar sakte hain?" : body.trim();
    if (!text) return;

    setBusy(true);
    setError(null);
    setRedactedNotice(false);
    try {
      const res = await fetch(`/api/partners/${partnerId}/enquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, requestCall }),
      });
      const data = (await res.json()) as { message?: string; redacted?: boolean };
      if (!res.ok) {
        setError(data.message ?? "Message nahi ja paya.");
        return;
      }
      setRedactedNotice(Boolean(data.redacted));
      setBody("");
      const reload = await fetch(`/api/partners/${partnerId}/enquiry`);
      if (reload.ok) {
        const fresh = (await reload.json()) as { thread: { messages: ThreadMessage[] } | null };
        setMessages(fresh.thread?.messages ?? []);
      }
    } catch {
      setError("Internet nahi mil raha. Dobara koshish kariye.");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <Card padding="lg">
        <h2 className="text-base font-semibold text-ink">Booking se pehle sawaal poochhein</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {partnerName} se seedhe yahin baat kar sakte hain — login karke.
        </p>
        <div className="mt-4">
          <Link href={`/login?next=${encodeURIComponent(returnTo)}`}>
            <Button variant="secondary">Login to Ask</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <h2 className="text-base font-semibold text-ink">Booking se pehle sawaal poochhein</h2>
      <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
        {ENQUIRY_REDACTION_NOTE}
      </p>

      {loaded && messages.length > 0 && (
        <div className="mt-4 max-h-72 space-y-2.5 overflow-y-auto rounded-lg border border-line bg-bg-subtle p-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.author === "USER" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  m.author === "USER"
                    ? "bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg"
                    : "border border-line bg-surface text-ink",
                )}
              >
                {m.body}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <div className="mt-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={MAX_ENQUIRY_MESSAGE_CHARS}
          placeholder="Jaise: mere bhai ke liye Jaipur me dekh rahe hain — aap kis tarah madad karte hain?"
        />
      </div>

      {redactedNotice && (
        <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg border border-warn/40 bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Aapka number/email message se hata diya gaya. Booking ke baad partner aapse platform par hi baat
          karenge.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
        <Button onClick={() => send(false)} loading={busy} disabled={!body.trim()} icon={<Send className="size-4" />}>
          Send
        </Button>
        <Button variant="secondary" onClick={() => send(true)} loading={busy} icon={<PhoneCall className="size-4" />}>
          Request a Call
        </Button>
      </div>
    </Card>
  );
}
