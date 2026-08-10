"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import type { PollView } from "@/lib/services/vibe/pollService";

/**
 * Today's Vibe Hub question, answerable without leaving the conversation.
 *
 * The one action in the catalog that reaches nobody — it records the user's own
 * answer. It earns its place because of what it unblocks: soch fit stays
 * unmeasurable until two people have answered enough of the same questions, so
 * "aap dono ne itne same sawaal answer nahi kiye" is a sentence Grio has to say
 * on profile after profile with no way to fix it. This is the fix, one tap from
 * where the sentence was said.
 *
 * Already-voted is a real state, not an error: the sheet shows what was chosen
 * and stops there, because `castVote` is one vote per poll per person and
 * offering the options again would be offering something that cannot happen.
 */
export default function GrioPollSheet({
  open,
  onClose,
  onVoted,
}: {
  open: boolean;
  onClose: () => void;
  onVoted: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [poll, setPoll] = useState<PollView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPoll(null);
    fetch("/api/arena/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setPoll(json?.poll ?? null))
      .catch(() => setPoll(null))
      .finally(() => setLoading(false));
  }, [open]);

  async function vote(optionIndex: number) {
    if (!poll || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/arena/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        toast({
          title: t("grio.voteFailed", "Jawab save nahi hua"),
          description: json.message ?? t("grio.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }
      toast({ title: t("grio.voteSaved", "Jawab save ho gaya"), tone: "success" });
      onVoted();
      onClose();
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => (busy ? undefined : onClose())}
      variant="bottom"
      title={t("grio.todayQuestion", "Aaj ka sawaal")}
    >
      {loading ? (
        <p className="py-6 text-center text-[0.8125rem] text-muted">{t("grio.loading", "Load ho raha hai…")}</p>
      ) : !poll ? (
        <p className="py-6 text-center text-[0.8125rem] text-muted">
          {t("grio.pollUnavailable", "Aaj ka sawaal abhi available nahi hai.")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-300">
              {poll.themeTagline}
            </p>
            <p className="mt-1 text-[0.9375rem] leading-snug text-ink">{poll.question}</p>
          </div>

          {poll.votedOptionIndex !== null ? (
            <p className="rounded-md border border-line bg-bg-subtle px-3 py-2.5 text-[0.8125rem] text-muted">
              {t("grio.alreadyVoted", "Aap aaj ka jawab de chuke hain:")}{" "}
              <span className="font-medium text-ink">{poll.options[poll.votedOptionIndex]}</span>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {poll.options.map((option, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={busy}
                  onClick={() => vote(i)}
                  className="rounded-md border border-line px-3 py-2.5 text-left text-[0.875rem] text-ink transition-colors hover:border-gold-400 disabled:opacity-55"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
