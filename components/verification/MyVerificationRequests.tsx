"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import type { Translate } from "@/lib/i18n/translate";
import { VERIFICATION_DISCLOSURE } from "@/lib/services/verification/verificationCatalog";
import type { VerificationRequestView } from "@/lib/services/verification/verificationRequestService";

/**
 * The asks pointed at you, and the ones you made.
 *
 * ## Why "nahi" needs no reason
 *
 * The decline reason is one optional field and it stays optional. Being asked
 * to prove your identity to somebody you are considering marrying is a
 * reasonable thing to refuse, and a mandatory justification box would teach
 * people that saying no costs more than saying yes — which is how a consent
 * feature becomes a pressure feature.
 *
 * ## Why accepting can open a checkout
 *
 * When the two agreed to split, the subject's share is due at the moment they
 * accept. The request stays with them until it lands, so a half-funded check
 * never reaches the staff queue.
 */
function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function MyVerificationRequests({
  incoming,
  outgoing,
}: {
  incoming: VerificationRequestView[];
  outgoing: VerificationRequestView[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const pendingIn = incoming.filter((r) => r.status === "AWAITING_SUBJECT");
  const historyIn = incoming.filter((r) => r.status !== "AWAITING_SUBJECT");

  async function send(url: string, init: RequestInit): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: t("verification.myRequests.actionFailedTitle", "Nahi ho paya"),
          description: json?.message ?? t("verification.myRequests.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return false;
      }
      if (json?.checkoutUrl) {
        window.location.href = json.checkoutUrl;
        return true;
      }
      router.refresh();
      return true;
    } catch {
      toast({ title: t("verification.myRequests.networkError", "Network error — dobara try karein"), tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const decide = (id: string, accept: boolean, declineReason?: string) =>
    send(`/api/verification/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept, ...(declineReason ? { declineReason } : {}) }),
    });

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="text-sm font-semibold text-ink">{t("verification.myRequests.incomingHeading", "Aapse maanga gaya")}</h2>

        {pendingIn.length === 0 && historyIn.length === 0 && (
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
            {t("verification.myRequests.incomingEmpty", "Abhi kisi ne aapse kuch prove karne ko nahi kaha.")}
          </p>
        )}

        {pendingIn.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2.5">
            {pendingIn.map((r) => (
              <li key={r.id} className="rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
                <p className="text-[0.875rem] font-semibold text-ink">{r.label}</p>
                {r.message && (
                  <p className="mt-1 whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-muted">
                    “{r.message}”
                  </p>
                )}
                <p className="mt-1 text-[0.75rem] text-muted">
                  {r.yourSharePaise > 0
                    ? `${t("verification.myRequests.yourSharePrefix", "Aapka hissa")} ${rupees(
                        r.yourSharePaise,
                      )} ${t("verification.myRequests.yourShareSuffix", "— haan kehne par lagega.")}`
                    : t("verification.myRequests.noShare", "Aapko kuch nahi dena. Kharcha unhone uthaya hai.")}
                </p>

                {decliningId === r.id ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value.slice(0, 200))}
                      placeholder={t("verification.myRequests.declineReasonPlaceholder", "Wajah likhni ho to (zaroori nahi)")}
                      className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (await decide(r.id, false, reason.trim() || undefined)) {
                            setDecliningId(null);
                            setReason("");
                          }
                        }}
                        className="rounded-md border border-line px-3 py-2 text-[0.75rem] text-ink hover:border-gold-500 disabled:opacity-55"
                      >
                        {t("verification.myRequests.confirmDeclineAction", "Mana kar dijiye")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecliningId(null)}
                        className="px-2 py-2 text-[0.75rem] text-muted hover:text-ink"
                      >
                        {t("verification.myRequests.cancelAction", "Cancel")}
                      </button>
                      {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(r.id, true)}
                      className="rounded-md border border-line px-3 py-1.5 text-[0.75rem] font-medium text-ink hover:border-gold-500 disabled:opacity-55"
                    >
                      {r.yourSharePaise > 0
                        ? `${t("verification.myRequests.acceptWithSharePrefix", "Haan —")} ${rupees(
                            r.yourSharePaise,
                          )} ${t("verification.myRequests.acceptWithShareSuffix", "dekar")}`
                        : t("verification.myRequests.acceptAction", "Haan, karwa lijiye")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setDecliningId(r.id)}
                      className="rounded-md border border-line px-3 py-1.5 text-[0.75rem] text-muted hover:border-line-strong hover:text-ink disabled:opacity-55"
                    >
                      {t("verification.myRequests.declineAction", "Nahi")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {historyIn.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {historyIn.map((r) => (
              <li key={r.id} className="text-[0.75rem] leading-relaxed text-muted">
                {r.label} — {statusWord(r.status, t)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink">{t("verification.myRequests.outgoingHeading", "Aapne maanga")}</h2>
        {outgoing.length === 0 ? (
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
            {t(
              "verification.myRequests.outgoingEmpty",
              "Aapne abhi kisi se kuch nahi maanga. Kisi rishtey ke andar se maang sakte hain.",
            )}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {outgoing.map((r) => (
              <li key={r.id} className="rounded-md border border-line/70 bg-surface-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.8125rem] text-ink">{r.label}</span>
                  <span className="text-[0.75rem] text-muted">{statusWord(r.status, t)}</span>
                  {(r.status === "AWAITING_PAYMENT" || r.status === "AWAITING_SUBJECT") && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send(`/api/verification/requests/${r.id}`, { method: "DELETE" })}
                      className="ml-auto text-[0.75rem] text-muted underline underline-offset-2 hover:text-ink disabled:opacity-55"
                    >
                      {t("verification.myRequests.withdrawAction", "Wapas lijiye")}
                    </button>
                  )}
                </div>
                {r.declineReason && (
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">“{r.declineReason}”</p>
                )}
                {r.resultNote && (
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-ink">{r.resultNote}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="border-t border-line pt-3 text-[0.75rem] leading-relaxed text-muted">
        {VERIFICATION_DISCLOSURE}
      </p>
    </div>
  );
}

function statusWord(status: VerificationRequestView["status"], t: Translate): string {
  switch (status) {
    case "AWAITING_PAYMENT":
      return t("verification.myRequests.status.awaitingPayment", "payment baaki");
    case "AWAITING_SUBJECT":
      return t("verification.myRequests.status.awaitingSubject", "unke jawaab ka intezaar");
    case "ACCEPTED":
      return t("verification.myRequests.status.accepted", "check chal raha hai");
    case "DECLINED":
      return t("verification.myRequests.status.declined", "unhone mana kiya");
    case "CANCELLED":
      return t("verification.myRequests.status.cancelled", "wapas liya gaya");
    case "EXPIRED":
      return t("verification.myRequests.status.expired", "waqt nikal gaya");
    case "COMPLETED":
      return t("verification.myRequests.status.completed", "poora hua");
  }
}
