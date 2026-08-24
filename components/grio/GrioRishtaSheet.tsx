"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import type { RishtaSummary } from "@/lib/services/rishta/journeyService";

export type RishtaSheetMode = "rishtaReflection" | "rishtaMeeting" | "rishtaTopic";

/**
 * The three things a user can record *about* one rishta, without leaving the
 * conversation.
 *
 * One component rather than three, because all three are the same shape — a
 * short piece of the user's own text, posted to the same endpoint, scoped to
 * the person Grio is already focused on. Three near-identical sheets would be
 * three places for "which person is this for?" to drift apart.
 *
 * ## The model proposes the verb, never the words
 *
 * Grio decides *that* a reflection is worth saving and which chip to offer. What
 * gets stored is typed here, by the user. That is the same rule `<<<SEND>>>` and
 * the voice note follow, and it matters most for reflections: a note the model
 * wrote about how a conversation went would be an opinion filed under the
 * user's name, in the one store nobody else can correct.
 *
 * ## Topics come from the journey, not from a text box
 *
 * The topic mode lists what is currently unresolved and marks one done. It does
 * not accept free text, because an arbitrary label would not match anything the
 * Compatibility Lab seeded and would leave the real topic still open — the user
 * would think they had closed something they had not.
 */
export default function GrioRishtaSheet({
  mode,
  target,
  onClose,
  onOutcome,
}: {
  mode: RishtaSheetMode | null;
  target: { profileId: string; name: string } | null;
  onClose: () => void;
  /** Code's sentence, written back into the transcript so the next turn knows. */
  onOutcome: (line: string) => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [place, setPlace] = useState("");
  const [when, setWhen] = useState("");
  const [summary, setSummary] = useState<RishtaSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const open = mode !== null && target !== null;

  useEffect(() => {
    if (!open) return;
    setText("");
    setPlace("");
    setWhen("");
    setSummary(null);
    // Only the topic mode needs the journey, and only for its unresolved list.
    if (mode !== "rishtaTopic") return;
    fetch(`/api/rishta/${target!.profileId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSummary(j?.summary ?? null))
      .catch(() => setSummary(null));
  }, [open, mode, target]);

  async function post(body: Record<string, unknown>, outcome: string) {
    if (!target || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rishta/${target.profileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: t("grio.actionFailed", "Nahi ho paya"),
          description: json?.message ?? t("grio.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }
      onOutcome(`✓ ${outcome}`);
      onClose();
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const name = target?.name ?? "";

  const title =
    mode === "rishtaMeeting"
      ? `${name} — mulaqat`
      : mode === "rishtaTopic"
        ? `${name} — kaunsi baat ho gayi?`
        : `${name} — apna note`;

  return (
    <Sheet open={open} onClose={() => (busy ? undefined : onClose())} variant="bottom" title={title}>
      {mode === "rishtaReflection" && (
        <>
          <p className="mb-2 text-[0.75rem] leading-relaxed text-muted">
            Ye sirf aapke liye hai — na unhe dikhta hai, na ghar walon ko. Baad me jab yaad na ho, tab kaam aata hai.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            rows={4}
            placeholder="Jaise: baat achhi hui, par relocation par abhi clear nahi hain"
            className="w-full resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500"
          />
          <Button
            variant="accent"
            fullWidth
            className="mt-3"
            disabled={!text.trim() || busy}
            onClick={() => void post({ action: "reflection", body: text.trim() }, "Note save ho gaya.")}
          >
            Save note
          </Button>
        </>
      )}

      {mode === "rishtaMeeting" && (
        <>
          <p className="mb-2 text-[0.75rem] leading-relaxed text-muted">
            Plan hai to aage ki tareekh dijiye, ho chuki hai to peeche ki — app khud samajh lega.
          </p>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500"
          />
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value.slice(0, 120))}
            placeholder="Kahan? Jaise: ghar par, cafe, video call"
            className="mt-2 min-h-11 w-full rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500"
          />
          <Button
            variant="accent"
            fullWidth
            className="mt-3"
            disabled={!when || busy}
            onClick={() => {
              const at = new Date(when);
              // Past or future decides which column it lands in — a meeting that
              // has happened has a date it happened on, and one that has not is
              // simply scheduled. See the `RishtaMeeting` model note.
              const past = at.getTime() < Date.now();
              void post(
                {
                  action: "meeting",
                  ...(past ? { happenedAt: at.toISOString() } : { scheduledFor: at.toISOString() }),
                  place: place.trim() || undefined,
                },
                past ? "Mulaqat record ho gayi." : "Mulaqat ka plan save ho gaya.",
              );
            }}
          >
            Save
          </Button>
        </>
      )}

      {mode === "rishtaTopic" && (
        <>
          {summary === null ? (
            <p className="py-6 text-center text-[0.8125rem] text-muted">{t("grio.loading", "Load ho raha hai…")}</p>
          ) : summary.unresolvedTopics.length === 0 ? (
            <p className="py-4 text-[0.875rem] leading-relaxed text-muted">
              Abhi is rishtey me koi baat pending nahi hai.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {summary.unresolvedTopics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void post(
                      { action: "topic", label: topic.label, resolved: true },
                      `"${topic.label}" ab ho chuki baaton me chali gayi.`,
                    )
                  }
                  className="rounded-md border border-line px-3 py-2.5 text-left text-[0.875rem] text-ink transition-colors hover:border-gold-400 disabled:opacity-55"
                >
                  {topic.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
