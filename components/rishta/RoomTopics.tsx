"use client";

import { useState } from "react";
import { Check, Circle, Loader2, Plus } from "lucide-react";
import { useRishtaPost } from "./useRishtaPost";
import type { RishtaSummary } from "@/lib/services/rishta/journeyService";

/**
 * The list of things these two still have to talk about.
 *
 * ## Why the user can add to a list the app seeds
 *
 * The Compatibility Lab seeds this from its `DISCUSS` dimensions, and that seed
 * is good but narrow — it only knows the questions in the catalog. The topic
 * that actually decides most rishtey ("naukri ke baad shift karna padega",
 * "ammi ke ilaaj ka kharcha") is never in a catalog. So the list is open, and a
 * typed topic sits beside a seeded one with no visible difference, because to
 * the person having the conversation there is none.
 *
 * ## Resolving is one tap and has no undo
 *
 * Deliberately. `upsertRishtaTopic` keys on the label, so re-adding the same
 * text is the undo — and a confirm dialog on "we talked about this" would be
 * the app doubting a user about their own conversation.
 */
export default function RoomTopics({ summary }: { summary: RishtaSummary }) {
  const { post, busy } = useRishtaPost(summary.otherUserId);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  const unresolved = summary.unresolvedTopics;
  const resolved = summary.resolvedTopics;

  async function add() {
    const text = label.trim();
    if (!text) return;
    if (await post({ action: "topic", label: text })) {
      setLabel("");
      setAdding(false);
    }
  }

  return (
    <div>
      {unresolved.length === 0 && resolved.length === 0 && (
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Abhi koi baat list me nahi hai. Jo cheez aapko poochhni hai par abhi tak poochhi nahi — wo yahan
          likh dijiye, warna wo aakhir tak reh jaati hai.
        </p>
      )}

      {unresolved.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {unresolved.map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void post({ action: "topic", label: t.label, resolved: true })}
                aria-label={`"${t.label}" par baat ho gayi`}
                className="mt-0.5 shrink-0 rounded-full text-muted transition-colors hover:text-trust disabled:opacity-55"
              >
                <Circle className="size-4" />
              </button>
              <span className="text-[0.8125rem] leading-relaxed text-ink">{t.label}</span>
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
          {resolved.map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
              <span className="text-[0.8125rem] leading-relaxed text-muted line-through decoration-line">
                {t.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value.slice(0, 120))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Jaise: shaadi ke baad kahan rehna hai"
            className="min-h-10 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
          />
          <button
            type="button"
            disabled={busy || !label.trim()}
            onClick={() => void add()}
            className="rounded-md border border-line px-3 py-2 text-[0.75rem] text-ink hover:border-gold-500 disabled:opacity-55"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="px-2 py-2 text-[0.75rem] text-muted hover:text-ink"
          >
            Cancel
          </button>
          {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-1.5 text-[0.75rem] font-medium text-muted transition-colors hover:text-ink"
        >
          <Plus className="size-3.5" />
          Add a topic
        </button>
      )}
    </div>
  );
}
