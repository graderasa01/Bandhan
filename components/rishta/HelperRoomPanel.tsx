"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Circle, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import type { Translate } from "@/lib/i18n/translate";
import {
  PARTICIPANT_SELF_DISCLOSURE,
  REQUEST_KIND_LABEL,
  MIN_REQUEST_NOTE_CHARS,
  PERMISSION_FOR_REQUEST,
} from "@/lib/services/rishta/roomCollabPolicy";
import type { ParticipantRoomView } from "@/lib/services/rishta/roomParticipantService";
import type { RishtaRequestKind } from "@prisma/client";

/**
 * One room, as the person helping sees it.
 *
 * ## Why one component for two portals
 *
 * A partner and a family member do completely different jobs and authenticate
 * in completely different ways — but inside a rishta they are the same thing: a
 * helper who can see a little, do what they were asked, and ask for the rest.
 * Two components would be two places for that "little" to quietly grow.
 *
 * The only difference between the two callers is `apiBase`, and it is the
 * *route* that differs, not the payload: `/api/partner/rooms/…` and
 * `/api/family-portal/rooms/…` run identical actions behind different gates.
 *
 * ## What is not on this screen
 *
 * The chat, the owner's notes, the topics, the checkpoint, the candidate's
 * photos, anybody's contact. Not hidden — not fetched. See
 * `getParticipantRoomView`, which is an allow-list for this reason.
 */
const KINDS: RishtaRequestKind[] = ["FAMILY_INTRO", "CALL", "MEETING"];

function fmt(iso: string | null, translate: Translate): string {
  if (!iso) return translate("rishtaRoom.helperPanel.dateNotSet", "tareekh tay nahi");
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function HelperRoomPanel({
  room,
  apiBase,
}: {
  room: ParticipantRoomView;
  /** `/api/partner/rooms` or `/api/family-portal/rooms`. */
  apiBase: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const translate = useT();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<RishtaRequestKind | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");

  const allowed = KINDS.filter((k) => room.access.permissions.includes(PERMISSION_FOR_REQUEST[k]));
  const myTasks = room.tasks.filter((t) => t.mine);
  const otherTasks = room.tasks.filter((t) => !t.mine);
  const pending = room.requests.filter((r) => r.status === "PROPOSED");
  const answered = room.requests.filter((r) => r.status !== "PROPOSED");

  async function send(body: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/${room.access.participantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: translate("rishtaRoom.post.failedTitle", "Nahi ho paya"),
          description: json?.message ?? translate("rishtaRoom.post.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      toast({ title: translate("rishtaRoom.post.networkError", "Network error — dobara try karein"), tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function raise() {
    if (!kind || note.trim().length < MIN_REQUEST_NOTE_CHARS) return;
    const ok = await send({
      action: "request-raise",
      kind,
      note: note.trim(),
      ...(date ? { proposedFor: new Date(`${date}T12:00:00`).toISOString() } : {}),
      ...(place.trim() ? { proposedPlace: place.trim() } : {}),
    });
    if (ok) {
      setKind(null);
      setNote("");
      setDate("");
      setPlace("");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Where this rishta has got to ---- */}
      <section>
        <h2 className="text-sm font-semibold text-ink">{translate("rishtaRoom.helperPanel.stageHeading", "Kahan tak pahuncha")}</h2>
        <p className="mt-1 text-[0.875rem] text-ink">{room.stageLabel}</p>
        {room.nextMeeting && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[0.8125rem] text-muted">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            {fmt(room.nextMeeting.scheduledFor, translate)}
            {room.nextMeeting.place && ` · ${room.nextMeeting.place}`}
          </p>
        )}
      </section>

      {/* ---- What was asked of me ---- */}
      <section>
        <h2 className="text-sm font-semibold text-ink">{translate("rishtaRoom.helperPanel.myTasksHeading", "Aapke zimme")}</h2>
        {myTasks.length === 0 ? (
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
            {translate("rishtaRoom.helperPanel.myTasksEmpty", "Abhi aapke zimme koi kaam nahi hai.")}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {myTasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send({ action: "task-done", taskId: t.id, done: !t.doneAt })}
                  aria-label={
                    t.doneAt
                      ? `"${t.title}" ${translate("rishtaRoom.helperPanel.reopenAriaSuffix", "dobara kholiye")}`
                      : `"${t.title}" ${translate("rishtaRoom.helperPanel.markDoneAriaSuffix", "ho gaya")}`
                  }
                  className="mt-0.5 shrink-0 transition-colors disabled:opacity-55"
                >
                  {t.doneAt ? (
                    <Check className="size-4 text-trust" />
                  ) : (
                    <Circle className="size-4 text-muted hover:text-trust" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[0.8125rem] leading-relaxed ${
                      t.doneAt ? "text-muted line-through decoration-line" : "text-ink"
                    }`}
                  >
                    {t.title}
                  </p>
                  {t.dueAt && !t.doneAt && (
                    <p className="mt-0.5 text-[0.75rem] text-muted">
                      {fmt(t.dueAt, translate)} {translate("rishtaRoom.helperPanel.dueSuffix", "tak")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {otherTasks.length > 0 && (
          <p className="mt-2 text-[0.75rem] text-muted">
            {otherTasks.filter((t) => !t.doneAt).length}{" "}
            {translate("rishtaRoom.helperPanel.otherTasksSuffix", "kaam is rishtey me kisi aur ke zimme hain.")}
          </p>
        )}
      </section>

      {/* ---- What I have asked for ---- */}
      <section>
        <h2 className="text-sm font-semibold text-ink">{translate("rishtaRoom.helperPanel.myRequestsHeading", "Aapne kya kaha")}</h2>

        {pending.length === 0 && answered.length === 0 && (
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
            {translate("rishtaRoom.helperPanel.myRequestsEmpty", "Abhi aapne kuch nahi poochha.")}
          </p>
        )}

        {pending.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2">
            {pending.map((r) => (
              <li key={r.id} className="rounded-md border border-line/70 bg-surface-2 px-3 py-2">
                <p className="text-[0.8125rem] text-ink">{REQUEST_KIND_LABEL[r.kind]}</p>
                <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">“{r.note}”</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[0.75rem] text-muted">
                    {translate("rishtaRoom.helperPanel.awaitingAnswer", "Jawaab ka intezaar")}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send({ action: "request-withdraw", requestId: r.id })}
                    className="ml-auto text-[0.75rem] text-muted underline underline-offset-2 hover:text-ink disabled:opacity-55"
                  >
                    {translate("rishtaRoom.helperPanel.withdrawAction", "Wapas lijiye")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {answered.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {answered.map((r) => (
              <li key={r.id} className="text-[0.75rem] leading-relaxed text-muted">
                {REQUEST_KIND_LABEL[r.kind]} —{" "}
                {r.status === "APPROVED"
                  ? translate("rishtaRoom.helperPanel.statusApproved", "unhone haan ki")
                  : r.status === "DECLINED"
                    ? translate("rishtaRoom.helperPanel.statusDeclined", "unhone mana kiya")
                    : translate("rishtaRoom.helperPanel.statusWithdrawn", "wapas liya")}
                {r.ownerNote && <span className="text-ink"> “{r.ownerNote}”</span>}
              </li>
            ))}
          </ul>
        )}

        {allowed.length === 0 ? (
          <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
            {translate(
              "rishtaRoom.helperPanel.cannotAsk",
              "Aap yahan se kuch maang nahi sakte — unhone sirf dekhne aur kaam karne ki permission di hai.",
            )}
          </p>
        ) : kind ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-[0.8125rem] font-medium text-ink">{REQUEST_KIND_LABEL[kind]}</p>
            <textarea
              autoFocus
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder={translate("rishtaRoom.helperPanel.reasonPlaceholder", "Wajah likhiye — ye unhe dikhega")}
              className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
            />
            {kind !== "FAMILY_INTRO" && (
              <div className="flex flex-wrap gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label={translate("rishtaRoom.helperPanel.whenSuggestionAria", "Kab (suggestion)")}
                  className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
                />
                <input
                  value={place}
                  onChange={(e) => setPlace(e.target.value.slice(0, 120))}
                  placeholder={
                    kind === "CALL"
                      ? translate("rishtaRoom.helperPanel.callPlaceholder", "Call")
                      : translate("rishtaRoom.helperPanel.whereSuggestionPlaceholder", "Kahan? (suggestion)")
                  }
                  className="min-h-10 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.875rem] outline-none focus:border-gold-500"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || note.trim().length < MIN_REQUEST_NOTE_CHARS}
                onClick={() => void raise()}
                className="rounded-md border border-line px-3 py-2 text-[0.75rem] font-medium text-ink hover:border-gold-500 disabled:opacity-55"
              >
                {translate("rishtaRoom.helperPanel.sendAction", "Bhejiye")}
              </button>
              <button
                type="button"
                onClick={() => setKind(null)}
                className="px-2 py-2 text-[0.75rem] text-muted hover:text-ink"
              >
                {translate("rishtaRoom.helperPanel.cancelAction", "Cancel")}
              </button>
              {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {allowed.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="rounded-full border border-line px-2.5 py-1 text-[0.75rem] text-ink transition-colors hover:border-gold-400"
              >
                {REQUEST_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 border-t border-line pt-3 text-[0.75rem] leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
        {PARTICIPANT_SELF_DISCLOSURE}
      </p>
    </div>
  );
}
