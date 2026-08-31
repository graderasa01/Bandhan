"use client";

import { useState } from "react";
import { CalendarCheck, CalendarClock, Loader2, Plus } from "lucide-react";
import { useRishtaPost } from "./useRishtaPost";
import type { RishtaSummary } from "@/lib/services/rishta/journeyService";

/**
 * Mulaqatein — planned, and the ones that happened.
 *
 * ## Why "we met" updates the row instead of adding one
 *
 * A meeting has a date it happened on, or it has not happened — `RishtaMeeting`
 * has no status column, on purpose (see the model note). The obvious client
 * shortcut is to file a *second* row when the user says they met, and it
 * produces exactly the mess that model note was avoiding: one rishta holding a
 * plan nobody attended next to a meeting nobody planned. So the panel posts
 * `meeting-done` against the existing id.
 *
 * ## Why the date input is plain
 *
 * A meeting between two families gets fixed on WhatsApp, over a phone call, by
 * an uncle. The app is not arranging it — it is remembering it — so this is a
 * date and a place, not a scheduler with slots and invitations it cannot send.
 */

function fmt(iso: string | null): string {
  if (!iso) return "tareekh tay nahi";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function RoomMeetings({ summary }: { summary: RishtaSummary }) {
  const { post, busy } = useRishtaPost(summary.otherUserId);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");

  const upcoming = summary.meetings.filter((m) => !m.happenedAt);
  const past = summary.meetings.filter((m) => m.happenedAt);

  async function plan() {
    if (!date) return;
    // The input gives a plain date; noon local keeps it on the intended day
    // whichever way the server's timezone rounds it.
    const ok = await post({
      action: "meeting",
      scheduledFor: new Date(`${date}T12:00:00`).toISOString(),
      place: place.trim() || undefined,
    });
    if (ok) {
      setDate("");
      setPlace("");
      setAdding(false);
    }
  }

  return (
    <div>
      {upcoming.length === 0 && past.length === 0 && (
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Abhi koi mulaqat darj nahi hai.
        </p>
      )}

      {upcoming.length > 0 && (
        <ul className="flex flex-col gap-2">
          {upcoming.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line/70 bg-surface-2 px-3 py-2">
              <CalendarClock className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="text-[0.8125rem] text-ink">
                {fmt(m.scheduledFor)}
                {m.place && <span className="text-muted"> · {m.place}</span>}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void post({ action: "meeting-done", meetingId: m.id })}
                className="ml-auto rounded-md border border-line px-2.5 py-1 text-[0.75rem] text-ink hover:border-gold-500 disabled:opacity-55"
              >
                We met
              </button>
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <ul className={`flex flex-col gap-1.5 ${upcoming.length > 0 ? "mt-3 border-t border-line pt-3" : ""}`}>
          {past.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-[0.8125rem] text-muted">
              <CalendarCheck className="size-4 shrink-0 text-trust" aria-hidden />
              Mile — {fmt(m.happenedAt)}
              {m.place && ` · ${m.place}`}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
            />
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value.slice(0, 120))}
              placeholder="Kahan? Jaise: ghar par, cafe"
              className="min-h-10 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !date}
              onClick={() => void plan()}
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
          Plan a meeting
        </button>
      )}
    </div>
  );
}
