"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, MessageSquare, PhoneCall, Send, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import { ENQUIRY_REDACTION_NOTE, MAX_ENQUIRY_MESSAGE_CHARS } from "@/lib/services/marketplace/servicePolicy";
import { cn } from "@/lib/utils";

export interface PartnerThreadSummary {
  id: string;
  memberFirstName: string;
  serviceName: string | null;
  lastMessageAt: string;
  unread: number;
  callRequested: boolean;
  status: string;
}

interface ThreadMessage {
  id: string;
  author: "USER" | "PARTNER";
  body: string;
  createdAt: string;
}

/**
 * The partner's inbox for pre-booking questions.
 *
 * Same scrubbing rule as the member side, and the notice says so on the
 * partner's screen too — the temptation to move a conversation to WhatsApp is
 * at least as strong from this side, and a rule only one party is told about
 * reads as a trap rather than a policy.
 */
export default function PartnerEnquiriesClient({ threads }: { threads: PartnerThreadSummary[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(threads[0]?.id ?? null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redactedNotice, setRedactedNotice] = useState(false);

  async function open(id: string) {
    setOpenId(id);
    setLoading(true);
    setError(null);
    setRedactedNotice(false);
    try {
      const res = await fetch(`/api/partner/enquiries/${id}`);
      if (res.ok) {
        const data = (await res.json()) as { thread: { messages: ThreadMessage[] } };
        setMessages(data.thread.messages);
      }
    } catch {
      setError("Baat-cheet load nahi hui.");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!openId || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/partner/enquiries/${openId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", body: reply.trim() }),
      });
      const data = (await res.json()) as { message?: string; redacted?: boolean };
      if (!res.ok) {
        setError(data.message ?? "Message nahi ja paya.");
        return;
      }
      setRedactedNotice(Boolean(data.redacted));
      setReply("");
      await open(openId);
      router.refresh();
    } catch {
      setError("Internet nahi mil raha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section>
        <h1 className="text-2xl font-bold text-wine-700">Enquiries</h1>
        <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
          {ENQUIRY_REDACTION_NOTE}
        </p>
      </section>

      {threads.length === 0 ? (
        <Card variant="soft" padding="lg" className="text-center">
          <MessageSquare className="mx-auto size-10 text-muted" aria-hidden />
          <p className="mt-3 font-semibold text-ink">Abhi koi sawaal nahi aaya.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            Jab log aapka card dekh kar poochhenge, wo yahan dikhega.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => open(t.id)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition-colors",
                  openId === t.id ? "border-gold-500 bg-gold-50 dark:bg-gold-900/25" : "border-line bg-surface",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-ink">{t.memberFirstName}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.callRequested && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info-bg px-2 py-0.5 text-[0.6875rem] text-info">
                        <PhoneCall className="size-3" aria-hidden />
                        Call
                      </span>
                    )}
                    {t.unread > 0 && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] font-medium text-accent-fg">
                        {t.unread}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {new Date(t.lastMessageAt).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                </div>
                {t.serviceName && <p className="mt-0.5 text-[0.6875rem] text-muted">{t.serviceName}</p>}
              </button>
            ))}
          </div>

          {openId && (
            <Card padding="lg">
              {loading ? (
                <p className="text-sm text-muted">Load ho raha hai…</p>
              ) : (
                <>
                  <div className="max-h-80 space-y-2.5 overflow-y-auto rounded-lg border border-line bg-bg-subtle p-3">
                    {messages.length === 0 ? (
                      <p className="text-sm text-muted">Koi message nahi.</p>
                    ) : (
                      messages.map((m) => (
                        <div key={m.id} className={cn("flex", m.author === "PARTNER" ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                              m.author === "PARTNER"
                                ? "bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg"
                                : "border border-line bg-surface text-ink",
                            )}
                          >
                            {m.body}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3">
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      maxLength={MAX_ENQUIRY_MESSAGE_CHARS}
                      placeholder="Jawaab likhiye. Number ya email yahan mat likhiye — wo hata diya jayega."
                    />
                  </div>

                  {redactedNotice && (
                    <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg border border-warn/40 bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      Aapke message se number/email hata diya gaya.
                    </p>
                  )}
                  {error && (
                    <p role="alert" className="mt-2 rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger">
                      {error}
                    </p>
                  )}

                  <div className="mt-3">
                    <Button onClick={send} loading={busy} disabled={!reply.trim()} icon={<Send className="size-4" />}>
                      Reply
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
