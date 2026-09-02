"use client";

import { useState } from "react";
import { Check, Circle, Loader2, Plus, X } from "lucide-react";
import { useRishtaPost } from "./useRishtaPost";
import { SUGGESTED_TASKS, TASK_PARTY_LABEL } from "@/lib/services/rishta/roomCollabPolicy";
import type { RoomParticipantView } from "@/lib/services/rishta/roomParticipantService";
import type { RoomTaskView } from "@/lib/services/rishta/roomTaskService";

/**
 * Kaam — who owes what, and by when.
 *
 * ## Why this does not replace the sentence at the top of the page
 *
 * "Agla kadam" is computed from rows and is always true. A task list is
 * maintained by people and goes stale the moment somebody forgets to tick one.
 * Keeping them apart means the honest line stays honest, and this list stays
 * what it actually is: the things the owner has handed to somebody else, plus
 * the ones they have written down for themselves.
 *
 * ## Why the assignee picker only offers people already in the room
 *
 * Because assigning work to somebody who cannot see the rishta is a task that
 * will never be done, and the app would have no way to tell the owner why.
 */
function fmtDue(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function RoomTasks({
  otherUserId,
  tasks,
  participants,
}: {
  otherUserId: string;
  tasks: RoomTaskView[];
  participants: RoomParticipantView[];
}) {
  const { post, busy } = useRishtaPost(otherUserId);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("OWNER");
  const [due, setDue] = useState("");

  const open = tasks.filter((t) => !t.doneAt);
  const done = tasks.filter((t) => t.doneAt);
  const live = participants.filter((p) => p.live);

  async function add() {
    const text = title.trim();
    if (!text) return;

    // "OWNER" is its own value; anything else is a participant id, and the
    // party is read off that participant rather than asked for separately —
    // one choice for the user, two fields for the server.
    const chosen = live.find((p) => p.id === assignee);
    const ok = await post({
      action: "task-add",
      title: text,
      party: chosen ? (chosen.helperKind === "PARTNER" ? "PARTNER" : "FAMILY") : "OWNER",
      ...(chosen ? { participantId: chosen.id } : {}),
      ...(due ? { dueAt: new Date(`${due}T12:00:00`).toISOString() } : {}),
    });
    if (ok) {
      setTitle("");
      setDue("");
      setAssignee("OWNER");
      setAdding(false);
    }
  }

  return (
    <div>
      {open.length === 0 && done.length === 0 && (
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Abhi koi kaam darj nahi hai. Jo cheez kisi ko karni hai — aapko, ghar walon ko ya partner ko — wo
          yahan likh dijiye, taaki baad me &ldquo;kisne karna tha&rdquo; par baat na ho.
        </p>
      )}

      {open.length > 0 && (
        <ul className="flex flex-col gap-2">
          {open.map((t) => {
            const dueLabel = fmtDue(t.dueAt);
            return (
              <li key={t.id} className="flex items-start gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void post({ action: "task-done", taskId: t.id, done: true })}
                  aria-label={`"${t.title}" ho gaya`}
                  className="mt-0.5 shrink-0 rounded-full text-muted transition-colors hover:text-trust disabled:opacity-55"
                >
                  <Circle className="size-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8125rem] leading-relaxed text-ink">{t.title}</p>
                  <p className="mt-0.5 text-[0.75rem] text-muted">
                    {t.assigneeName ?? TASK_PARTY_LABEL[t.party]}
                    {dueLabel && (
                      <span className={t.overdue ? "text-danger" : undefined}>
                        {" · "}
                        {t.overdue ? `${dueLabel} tak tha` : `${dueLabel} tak`}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void post({ action: "task-delete", taskId: t.id })}
                  aria-label={`"${t.title}" hataiye`}
                  className="shrink-0 rounded-md p-1 text-muted transition-colors hover:text-ink disabled:opacity-55"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 && (
        <ul className={`flex flex-col gap-1.5 ${open.length > 0 ? "mt-3 border-t border-line pt-3" : ""}`}>
          {done.map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void post({ action: "task-done", taskId: t.id, done: false })}
                aria-label={`"${t.title}" dobara khol dijiye`}
                className="mt-0.5 shrink-0 text-trust transition-opacity hover:opacity-70 disabled:opacity-55"
              >
                <Check className="size-4" />
              </button>
              <span className="text-[0.8125rem] leading-relaxed text-muted line-through decoration-line">
                {t.title}
              </span>
              {t.doneByLabel && <span className="ml-auto text-[0.6875rem] text-muted">{t.doneByLabel}</span>}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 140))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Kaam kya hai?"
            className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
          />

          {title.trim().length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TASKS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTitle(s)}
                  className="rounded-full border border-line px-2.5 py-1 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
            >
              <option value="OWNER">Aap karenge</option>
              {live.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.helperName}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="Kab tak"
              className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !title.trim()}
              onClick={() => void add()}
              className="rounded-md border border-line px-3 py-2 text-[0.75rem] text-ink hover:border-gold-500 disabled:opacity-55"
            >
              Save
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
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-1.5 text-[0.75rem] font-medium text-muted transition-colors hover:text-ink"
        >
          <Plus className="size-3.5" />
          Kaam likhiye
        </button>
      )}
    </div>
  );
}
