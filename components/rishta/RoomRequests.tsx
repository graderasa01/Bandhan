"use client";

import { useState } from "react";
import { Check, Loader2, MessageSquareWarning, X } from "lucide-react";
import { useRishtaPost } from "./useRishtaPost";
import { REQUEST_KIND_ASK } from "@/lib/services/rishta/roomCollabPolicy";
import type { RoomRequestView } from "@/lib/services/rishta/roomRequestService";

/**
 * What the people helping have asked, and the owner's answer.
 *
 * ## Why "haan" opens a form instead of just saying yes
 *
 * Approving a call or a meeting creates a real row on the owner's own journey,
 * and the helper's proposed date is a suggestion — often made without knowing
 * whether the owner is free that evening. Showing the date and place as
 * editable at the moment of approval is what keeps the meeting *the owner's*
 * rather than something a partner scheduled and they consented to.
 *
 * A family introduction has nothing to schedule, so it approves in one tap and
 * leaves a task behind instead.
 *
 * ## Why declining needs no reason
 *
 * The note is optional and stays optional. "Nahi" is a complete answer about
 * your own marriage, and a mandatory justification field would quietly teach
 * people that refusing costs more than agreeing.
 */
function fmt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function RoomRequests({
  otherUserId,
  requests,
}: {
  otherUserId: string;
  requests: RoomRequestView[];
}) {
  const { post, busy } = useRishtaPost(otherUserId);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");

  const pending = requests.filter((r) => r.status === "PROPOSED");
  const decided = requests.filter((r) => r.status !== "PROPOSED");

  if (requests.length === 0) {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-muted">
        Abhi kisi ne kuch nahi poochha. Jinhe aapne is rishtey me jodha hai, wo yahan se keh sakte hain ki ghar
        walon ko jodna chahiye, call honi chahiye ya mulaqat tay honi chahiye — hoga wahi jo aap kahenge.
      </p>
    );
  }

  function startApprove(r: RoomRequestView) {
    setDecidingId(r.id);
    setDate(r.proposedFor ? r.proposedFor.slice(0, 10) : "");
    setPlace(r.proposedPlace ?? "");
    setNote("");
  }

  async function approve(r: RoomRequestView) {
    const ok = await post({
      action: "request-decide",
      requestId: r.id,
      approve: true,
      ...(note.trim() ? { ownerNote: note.trim() } : {}),
      ...(date ? { scheduledFor: new Date(`${date}T12:00:00`).toISOString() } : {}),
      ...(place.trim() ? { place: place.trim() } : {}),
    });
    if (ok) setDecidingId(null);
  }

  return (
    <div>
      {pending.length > 0 && (
        <ul className="flex flex-col gap-3">
          {pending.map((r) => (
            <li key={r.id} className="rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <MessageSquareWarning className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="text-[0.875rem] font-semibold text-ink">{r.raisedByLabel}</span>
                <span className="text-[0.75rem] text-muted">
                  {r.helperKind === "PARTNER" ? "partner" : "ghar se"}
                </span>
              </div>

              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink">{REQUEST_KIND_ASK[r.kind]}</p>
              <p className="mt-1 whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-muted">“{r.note}”</p>
              {(r.proposedFor || r.proposedPlace) && (
                <p className="mt-1 text-[0.75rem] text-muted">
                  {[fmt(r.proposedFor), r.proposedPlace].filter(Boolean).join(" · ")} — inka suggestion
                </p>
              )}

              {decidingId === r.id ? (
                <div className="mt-2.5 flex flex-col gap-2">
                  {r.kind !== "FAMILY_INTRO" && (
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        aria-label="Kab"
                        className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
                      />
                      <input
                        value={place}
                        onChange={(e) => setPlace(e.target.value.slice(0, 120))}
                        placeholder={r.kind === "CALL" ? "Call" : "Kahan?"}
                        className="min-h-10 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
                      />
                    </div>
                  )}
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 300))}
                    placeholder="Unhe kuch kehna hai? (optional)"
                    className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void approve(r)}
                      className="rounded-md border border-line px-3 py-2 text-[0.75rem] font-medium text-ink hover:border-gold-500 disabled:opacity-55"
                    >
                      Haan, tay kar dijiye
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecidingId(null)}
                      className="px-2 py-2 text-[0.75rem] text-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                    {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startApprove(r)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[0.75rem] font-medium text-ink hover:border-gold-500 disabled:opacity-55"
                  >
                    <Check className="size-3.5" />
                    Haan
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void post({ action: "request-decide", requestId: r.id, approve: false })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[0.75rem] text-muted hover:border-line-strong hover:text-ink disabled:opacity-55"
                  >
                    <X className="size-3.5" />
                    Abhi nahi
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <ul className={`flex flex-col gap-1.5 ${pending.length > 0 ? "mt-3 border-t border-line pt-3" : ""}`}>
          {decided.map((r) => (
            <li key={r.id} className="text-[0.75rem] leading-relaxed text-muted">
              {r.raisedByLabel} · {r.kindLabel} — {r.statusLabel}
              {r.ownerNote && <span className="text-ink"> “{r.ownerNote}”</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
