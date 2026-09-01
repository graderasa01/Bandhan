"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Info, MessageSquareQuote, Sparkles, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import {
  PROPOSAL_DISCLOSURE,
  PROPOSAL_SOURCE_LABEL,
  PROPOSAL_STATUS_LABEL,
} from "@/lib/services/clientDesk/clientDeskPolicy";
import type { ProposalView } from "@/lib/services/clientDesk/proposalService";
import { cn } from "@/lib/utils";

/**
 * The owner's approval queue.
 *
 * The card is built around one honesty: a proposal is a **paid person's
 * suggestion**, and the owner is entitled to weigh it differently from the
 * app's own ranking. So the partner's reason and the code's fit score sit side
 * by side, the source is labelled, and the disclosure line says which is
 * which. A queue that presented these as "your matches" would be laundering a
 * commercial recommendation through the platform's voice.
 *
 * Accepting adds the person to the owner's own shortlist and nothing else —
 * the copy says so, because "accept" in a matrimony product is otherwise very
 * easy to read as "send interest".
 */
export default function ProposalQueueClient({ proposals }: { proposals: ProposalView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const pending = proposals.filter((p) => p.status === "PROPOSED");
  const decided = proposals.filter((p) => p.status !== "PROPOSED");

  async function decide(id: string, decision: "accept" | "reject", withNote?: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/user/proposals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: withNote ?? null }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Ye faisla save nahi hua.");
        return;
      }
      setRejecting(null);
      setNote("");
      router.refresh();
    } catch {
      setError("Internet nahi mil raha.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section>
        <h1 className="text-2xl font-bold text-wine-700">Partner ke suggestions</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Aapke partner ne ye rishte aapke saamne rakhe hain. Haan karne par wo sirf aapki shortlist me
          jaate hain — interest ya message aap khud, baad me bhejte hain.
        </p>
      </section>

      <Card variant="info" padding="md">
        <div className="flex gap-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p className="text-xs leading-relaxed text-ink">{PROPOSAL_DISCLOSURE}</p>
        </div>
      </Card>

      {error && (
        <Card variant="danger" padding="md">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        </Card>
      )}

      {pending.length === 0 && decided.length === 0 && (
        <Card variant="soft" padding="lg" className="text-center">
          <Sparkles className="mx-auto size-10 text-gold-600" aria-hidden />
          <p className="mt-3 font-semibold text-ink">Abhi koi suggestion nahi.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            Jab aapke partner koi rishta aapke saamne rakhenge, wo yahan dikhega — wajah ke saath.
          </p>
          <div className="mt-5">
            <Link href="/partners">
              <Button variant="secondary">Find a Partner</Button>
            </Link>
          </div>
        </Card>
      )}

      {pending.map((p) => (
        <Card key={p.id} variant="luxe" padding="lg">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/user/profile/${p.candidateProfileId}`} className="font-semibold text-ink hover:underline">
                {p.candidateName}
              </Link>
              <p className="mt-0.5 text-xs text-muted">
                {[p.candidateAge ? `${p.candidateAge} saal` : null, p.candidateCity].filter(Boolean).join(" · ")}
              </p>
            </div>
            {p.fitScore !== null && (
              <div className="shrink-0 text-right">
                <p className="text-[0.6875rem] text-muted">Fit score</p>
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    p.fitScore >= 60 ? "text-trust" : p.fitScore >= 40 ? "text-ink" : "text-warn",
                  )}
                >
                  {p.fitScore}%
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-line bg-bg-subtle px-3.5 py-3">
            <p className="inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-muted">
              <MessageSquareQuote className="size-3.5" aria-hidden />
              {p.partnerName} ne likha
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink">{p.reason}</p>
            <p className="mt-2 text-[0.6875rem] text-muted">{PROPOSAL_SOURCE_LABEL[p.source]}</p>
          </div>

          {p.draftMessage && (
            <div className="mt-2.5 rounded-lg border border-gold-300 bg-gold-50 px-3.5 py-3 dark:bg-gold-900/20">
              <p className="text-[0.6875rem] font-medium text-gold-700 dark:text-gold-300">
                Partner ne pehla message likh kar diya hai — bhejenge aap khud, badal kar
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{p.draftMessage}</p>
            </div>
          )}

          {p.fitSummary && <p className="mt-2 text-[0.6875rem] text-muted">{p.fitSummary}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => decide(p.id, "accept")}
              loading={busy === p.id}
              icon={<Bookmark className="size-4" />}
            >
              Add to My Shortlist
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(rejecting === p.id ? null : p.id)}
              icon={<X className="size-4" />}
            >
              Not for Me
            </Button>
          </div>

          {rejecting === p.id && (
            <div className="mt-3 rounded-lg border border-line bg-bg-subtle p-3">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Wajah likhna zaroori nahi — par isse partner ko samajh aata hai ki kya nahi chahiye."
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" loading={busy === p.id} onClick={() => decide(p.id, "reject", note.trim() || undefined)}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {decided.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold text-ink">Pehle ke suggestions</h2>
          <div className="flex flex-col gap-2.5">
            {decided.map((p) => (
              <Card key={p.id} variant="soft" padding="md">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm text-ink">{p.candidateName}</span>
                  <span className="shrink-0 inline-flex items-center gap-1 text-[0.6875rem] text-muted">
                    {p.status === "ACCEPTED" && <Check className="size-3 text-trust" aria-hidden />}
                    {PROPOSAL_STATUS_LABEL[p.status]}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Card variant="soft" padding="md">
        <p className="text-xs leading-relaxed text-muted">
          Partner ne aapke liye kitni baar search chalayi, ye aap{" "}
          <Link href="/user/profile/access" className="underline">
            Profile Access
          </Link>{" "}
          par dekh sakte hain — aur wahin se permission hata bhi sakte hain.
        </p>
      </Card>
    </div>
  );
}
