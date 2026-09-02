"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldQuestion } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import VerificationBadgeList from "@/components/verification/VerificationBadgeList";
import {
  PAYER_LABEL,
  VERIFICATION_DISCLOSURE,
  catalogFor,
} from "@/lib/services/verification/verificationCatalog";
import type { VerificationBadge } from "@/lib/services/verification/verificationBadgeService";
import type { VerificationKind, VerificationPayer } from "@prisma/client";

/**
 * Verification, inside the one rishta it is about.
 *
 * ## Why it lives here and not on a profile
 *
 * "Should I ask this person for proof of who they are" is a question people have
 * exactly once they are seriously considering somebody — which is what a Rishta
 * Room *is*. Putting the ask on a profile card would invite it as a browsing
 * gesture, aimed at strangers, in bulk. `createVerificationRequest` refuses that
 * server-side too: no rishta, no ask.
 *
 * ## The three-line rule on this card
 *
 * The fee, who pays it, and the sentence saying money does not move the answer —
 * all three are on screen before the button, not after it. That is the same
 * anti-dark-pattern discipline the checkout screens follow, applied to the one
 * purchase in this product whose result a buyer might feel entitled to.
 */
function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export interface RoomVerificationAsk {
  id: string;
  kind: VerificationKind;
  label: string;
  status: string;
  outcome: string | null;
  resultNote: string | null;
  declineReason: string | null;
}

export default function RoomVerification({
  otherUserId,
  personName,
  badges,
  asked,
}: {
  otherUserId: string;
  personName: string;
  badges: VerificationBadge[];
  asked: RoomVerificationAsk[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<VerificationKind | null>(null);
  const [payer, setPayer] = useState<VerificationPayer>("REQUESTER");
  const [message, setMessage] = useState("");

  const askedKinds = new Set(asked.map((a) => a.kind));
  const askable = badges.filter((b) => b.requestable && !askedKinds.has(b.kind));

  async function ask() {
    if (!kind || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/verification/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectUserId: otherUserId,
          kind,
          payer,
          ...(message.trim() ? { message: message.trim() } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
      if (json?.checkoutUrl) {
        window.location.href = json.checkoutUrl;
        return;
      }
      setKind(null);
      setMessage("");
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const live = badges.filter((b) => b.state !== "NOT_CHECKED");

  return (
    <div>
      {live.length > 0 ? (
        <VerificationBadgeList badges={live} />
      ) : (
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          {personName} ka abhi koi check nahi hua hai.
        </p>
      )}

      {asked.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
          {asked.map((a) => (
            <li key={a.id} className="text-[0.75rem] leading-relaxed text-muted">
              Aapne maanga: {a.label} —{" "}
              {a.status === "AWAITING_PAYMENT"
                ? "payment baaki"
                : a.status === "AWAITING_SUBJECT"
                  ? "unke jawaab ka intezaar"
                  : a.status === "ACCEPTED"
                    ? "check chal raha hai"
                    : a.status === "DECLINED"
                      ? "unhone mana kiya"
                      : a.status === "COMPLETED"
                        ? "poora hua"
                        : "band"}
              {a.declineReason && <span className="text-ink"> “{a.declineReason}”</span>}
            </li>
          ))}
        </ul>
      )}

      {kind ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-[0.8125rem] font-medium text-ink">{catalogFor(kind).label}</p>
          <p className="text-[0.75rem] leading-relaxed text-muted">{catalogFor(kind).scope}</p>
          <p className="text-[0.75rem] leading-relaxed text-muted">{catalogFor(kind).notMeaning}</p>

          <textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 400))}
            placeholder="Kyun maang rahe hain? Unhe ye dikhega."
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
          />

          <div className="flex flex-wrap gap-1.5">
            {(["REQUESTER", "SPLIT", "SUBJECT"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPayer(p)}
                className={`rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors ${
                  payer === p ? "border-gold-500 text-ink" : "border-line text-muted hover:text-ink"
                }`}
              >
                {PAYER_LABEL[p]}
              </button>
            ))}
          </div>

          <p className="text-[0.75rem] text-muted">
            Poora kharcha {rupees(catalogFor(kind).feePaise)} —{" "}
            {payer === "REQUESTER"
              ? "poora aap denge"
              : payer === "SUBJECT"
                ? "poora wo denge, aur wo mana bhi kar sakte hain"
                : `aadha aap (${rupees(Math.ceil(catalogFor(kind).feePaise / 2))}), aadha wo`}
            .
          </p>
          <p className="text-[0.75rem] leading-relaxed text-muted">{VERIFICATION_DISCLOSURE}</p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void ask()}
              className="rounded-md border border-line px-3 py-2 text-[0.75rem] font-medium text-ink hover:border-gold-500 disabled:opacity-55"
            >
              Maangiye
            </button>
            <button
              type="button"
              onClick={() => setKind(null)}
              className="px-2 py-2 text-[0.75rem] text-muted hover:text-ink"
            >
              Cancel
            </button>
            {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
          </div>
        </div>
      ) : (
        askable.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-medium text-muted">
              <ShieldQuestion className="size-3.5" aria-hidden />
              Inse kuch prove karne ko keh sakte hain
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {askable.map((b) => (
                <button
                  key={b.kind}
                  type="button"
                  onClick={() => setKind(b.kind)}
                  className="rounded-full border border-line px-2.5 py-1 text-[0.75rem] text-ink transition-colors hover:border-gold-400"
                >
                  {b.label} · {rupees(b.feePaise)}
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
