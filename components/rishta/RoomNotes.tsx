"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { useRishtaPost } from "./useRishtaPost";
import { daysAgoLabel } from "@/lib/profile/rishtaTime";
import type { RishtaSummary } from "@/lib/services/rishta/journeyService";

/**
 * The user's own notes about this rishta.
 *
 * ## Whose words these are
 *
 * Only theirs. Grio can *propose* a note — that is what `SAVE_REFLECTION` does
 * — but what gets stored is what the user typed, and nothing in the app
 * rewrites, summarises or "improves" it. A reflection the model authored would
 * be the app telling somebody how they felt about a person, which is the single
 * worst thing this table could contain.
 *
 * ## Why they are never shown to anyone
 *
 * Not to the other person, not to family, not on any shared surface. This
 * exists so that "20 din baad" the app can answer honestly instead of
 * reconstructing a feeling from message timestamps — and it only works if the
 * user believes the box is private, which it is.
 */
export default function RoomNotes({ summary }: { summary: RishtaSummary }) {
  const { post, busy } = useRishtaPost(summary.otherUserId);
  const [body, setBody] = useState("");

  async function save() {
    const text = body.trim();
    if (!text) return;
    if (await post({ action: "reflection", body: text })) setBody("");
  }

  return (
    <div>
      <p className="flex items-center gap-1.5 text-[0.75rem] text-muted">
        <Lock className="size-3" aria-hidden />
        Sirf aapke liye. Na unhe dikhta hai, na ghar walon ko.
      </p>

      {summary.reflections.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2.5">
          {summary.reflections.map((r) => (
            <li key={r.id} className="rounded-md border border-line/70 bg-surface-2 px-3 py-2">
              <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-ink">{r.body}</p>
              <p className="mt-1 text-[0.6875rem] text-muted">{daysAgoLabel(r.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 1000))}
        rows={3}
        placeholder="Aaj kya laga? Do line likh dijiye — baad me yahi yaad dilayenge."
        className="mt-3 w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] leading-relaxed outline-none focus:border-gold-500"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={() => void save()}
          className="rounded-md border border-line px-3 py-2 text-[0.75rem] text-ink hover:border-gold-500 disabled:opacity-55"
        >
          Save note
        </button>
        {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
      </div>
    </div>
  );
}
