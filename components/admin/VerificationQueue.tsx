"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import type { QueueRow } from "@/lib/services/verification/humanVerificationQueue";

/**
 * The staff queue for human verification.
 *
 * ## Why the evidence box is mandatory and the result note is not
 *
 * The evidence note is what makes a result auditable a year later, when the
 * person who did the check has left and somebody is asking why a badge says
 * what it says. The result note is the one line the two *members* read, and a
 * check can be perfectly well recorded without one.
 *
 * The two boxes are deliberately different widths and differently labelled,
 * because the failure mode this screen has to prevent is a checker pasting what
 * they saw on a document into the member-visible field.
 */
export default function VerificationQueue({ open, decided }: { open: QueueRow[]; decided: QueueRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("MATCHED");
  const [evidence, setEvidence] = useState("");
  const [resultNote, setResultNote] = useState("");

  const OUTCOMES = [
    { value: "MATCHED", label: t("verification.queue.outcomeMatched", "Mel khaya") },
    { value: "MISMATCH", label: t("verification.queue.outcomeMismatch", "Farq mila") },
    { value: "COULD_NOT_COMPLETE", label: t("verification.queue.outcomeIncomplete", "Poora nahi ho paya") },
  ] as const;

  async function send(checkId: string, body: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/verification-checks/${checkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: t("verification.queue.actionFailedTitle", "Nahi ho paya"),
          description: json?.message ?? t("verification.queue.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      toast({ title: t("verification.queue.networkError", "Network error"), tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-wine-700">{t("verification.queue.title", "Human Verification")}</h2>
      <p className="mt-1 text-sm text-muted">
        {open.length > 0
          ? `${open.length} ${t(
              "verification.queue.pendingSuffix",
              "check pending hain. Nateeja darj karte hi dono ko pata chal jayega — outcome sirf unki verification screen par dikhega.",
            )}`
          : t("verification.queue.noneOpen", "Koi check pending nahi hai.")}
      </p>

      {open.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {open.map((c) => (
            <li key={c.checkId} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">{c.kindLabel}</span>
                <span className="text-sm text-muted">{c.subjectName}</span>
                {c.requesterName && (
                  <span className="text-xs text-muted">
                    — {c.requesterName} {t("verification.queue.requestedBySuffix", "ne maanga")}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted">
                  {c.assignedToName
                    ? `${c.assignedToName} ${t("verification.queue.watchingSuffix", "dekh rahe hain")}`
                    : t("verification.queue.unassigned", "kisi ne nahi liya")}
                </span>
              </div>

              {c.requestMessage && (
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">“{c.requestMessage}”</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send(c.checkId, { action: "assign", toMe: !c.assignedToUserId })}
                  className="rounded-md border border-line px-3 py-1.5 text-xs text-ink hover:border-gold-500 disabled:opacity-55"
                >
                  {c.assignedToUserId
                    ? t("verification.queue.releaseAction", "Chhod dijiye")
                    : t("verification.queue.takeAction", "Main dekhta hoon")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(activeId === c.checkId ? null : c.checkId);
                    setOutcome("MATCHED");
                    setEvidence("");
                    setResultNote("");
                  }}
                  className="rounded-md border border-line px-3 py-1.5 text-xs text-ink hover:border-gold-500"
                >
                  {t("verification.queue.recordOutcomeAction", "Nateeja darj kariye")}
                </button>
              </div>

              {activeId === c.checkId && (
                <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {OUTCOMES.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setOutcome(o.value)}
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          outcome === o.value ? "border-gold-500 text-ink" : "border-line text-muted hover:text-ink"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>

                  <label className="text-xs font-medium text-ink">
                    {t("verification.queue.evidenceLabel", "Kya dekha aur kya nikla — sirf team ke liye")}
                    <textarea
                      rows={3}
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value.slice(0, 2000))}
                      className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-gold-500"
                    />
                  </label>

                  <label className="text-xs font-medium text-ink">
                    {t("verification.queue.resultNoteLabel", "Ek line jo dono members padhenge (optional)")}
                    <input
                      value={resultNote}
                      onChange={(e) => setResultNote(e.target.value.slice(0, 300))}
                      placeholder={t("verification.queue.resultNotePlaceholder", "Jaise: naam aur janm-tareekh mel khaye")}
                      className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-gold-500"
                    />
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || evidence.trim().length < 10}
                      onClick={async () => {
                        const ok = await send(c.checkId, {
                          action: "result",
                          outcome,
                          evidenceNote: evidence.trim(),
                          ...(resultNote.trim() ? { resultNote: resultNote.trim() } : {}),
                        });
                        if (ok) setActiveId(null);
                      }}
                      className="rounded-md border border-line px-3 py-2 text-xs font-medium text-ink hover:border-gold-500 disabled:opacity-55"
                    >
                      {t("verification.queue.submitAction", "Darj kariye")}
                    </button>
                    {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 border-t border-line pt-3">
          {decided.slice(0, 15).map((c) => (
            <li key={c.checkId} className="text-xs text-muted">
              {c.kindLabel} · {c.subjectName} — {c.outcome}
              {c.checkedAt && ` · ${new Date(c.checkedAt).toLocaleDateString("en-IN")}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
