"use client";

import { useState } from "react";
import { Building2, Loader2, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useRishtaPost } from "./useRishtaPost";
import { useT } from "@/components/i18n/LanguageProvider";
import { PARTICIPANT_DISCLOSURE } from "@/lib/services/rishta/roomCollabPolicy";
import type { AdmittableHelper, RoomParticipantView } from "@/lib/services/rishta/roomParticipantService";

/**
 * Who else is standing in this room.
 *
 * ## Why the disclosure sits under the list and not behind a "?"
 *
 * The single most over-read thing in this feature is what a helper can see.
 * "Papa ko jod diya" feels, to the person doing it, like handing over the whole
 * conversation — and for a partner it feels like hiring somebody who now reads
 * everything. Neither is true, and the sentence saying so is worth more screen
 * space than the avatars above it.
 *
 * ## Why removal has no confirm dialog
 *
 * Removing somebody from one rishta is small, reversible in one tap, and costs
 * the owner nothing — their delegation is untouched and re-admitting them
 * restores the same row. A confirmation would make the safe direction feel like
 * the dangerous one.
 */
export default function RoomParticipants({
  otherUserId,
  participants,
  admittable,
}: {
  otherUserId: string;
  participants: RoomParticipantView[];
  admittable: AdmittableHelper[];
}) {
  const { post, busy } = useRishtaPost(otherUserId);
  const t = useT();
  const [adding, setAdding] = useState(false);

  if (participants.length === 0 && admittable.length === 0) {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-muted">
        {t("rishtaRoom.participants.emptyPrefix", "Is rishtey me abhi sirf aap hain. Ghar walon ya kisi partner ko madad ke liye jodna ho to pehle unhe")}{" "}
        <span className="font-medium text-ink">Profile Access</span>{" "}
        {t("rishtaRoom.participants.emptySuffix", "se permission dijiye — uske baad wo yahan dikhenge.")}
      </p>
    );
  }

  return (
    <div>
      {participants.length > 0 && (
        <ul className="flex flex-col gap-2">
          {participants.map((p) => (
            <li key={p.id} className="rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {p.helperKind === "PARTNER" ? (
                  <Building2 className="size-4 shrink-0 text-muted" aria-hidden />
                ) : (
                  <Users className="size-4 shrink-0 text-muted" aria-hidden />
                )}
                <span className="text-[0.875rem] font-semibold text-ink">{p.helperName}</span>
                <span className="text-[0.75rem] text-muted">
                  {p.helperKind === "PARTNER"
                    ? t("rishtaRoom.participants.kindPartner", "partner")
                    : t("rishtaRoom.participants.kindFamily", "ghar se")}
                </span>
                {!p.live && (
                  <span className="rounded border border-line px-1.5 py-0.5 text-[0.6875rem] text-muted">
                    {t("rishtaRoom.participants.permissionEnded", "permission khatam")}
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void post({ action: "participant-remove", participantId: p.id })}
                  aria-label={`${p.helperName} ${t("rishtaRoom.participants.removeAriaSuffix", "ko is rishtey se hataiye")}`}
                  className="ml-auto rounded-md p-1 text-muted transition-colors hover:text-ink disabled:opacity-55"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* What they may ask for. An empty list is a real, common state —
                  somebody in the room to see the stage and take a task, and to
                  ask for nothing. Saying so beats an empty gap. */}
              <p className="mt-1.5 text-[0.75rem] leading-relaxed text-muted">
                {p.permissionLabels.length > 0
                  ? p.permissionLabels.join(" · ")
                  : t(
                      "rishtaRoom.participants.noPermissions",
                      "Sirf dekh sakte hain aur kaam le sakte hain — kuch maang nahi sakte.",
                    )}
              </p>

              {(p.openTasks > 0 || p.pendingRequests > 0) && (
                <p className="mt-1 text-[0.75rem] text-muted">
                  {[
                    p.openTasks > 0
                      ? `${p.openTasks} ${t("rishtaRoom.participants.openTasksSuffix", "kaam baaki")}`
                      : null,
                    p.pendingRequests > 0
                      ? `${p.pendingRequests} ${t("rishtaRoom.participants.pendingRequestsSuffix", "baat aapke jawaab par")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && admittable.length > 0 && (
        <ul className={`flex flex-col gap-1.5 ${participants.length > 0 ? "mt-3 border-t border-line pt-3" : ""}`}>
          {admittable.map((h) => (
            <li key={h.delegationId} className="flex flex-wrap items-center gap-2">
              <span className="text-[0.8125rem] text-ink">{h.helperName}</span>
              <span className="text-[0.75rem] text-muted">
                {h.helperKind === "PARTNER"
                  ? t("rishtaRoom.participants.kindPartner", "partner")
                  : t("rishtaRoom.participants.kindFamily", "ghar se")}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await post({ action: "participant-admit", delegationId: h.delegationId })) setAdding(false);
                }}
                className="ml-auto rounded-md border border-line px-2.5 py-1 text-[0.75rem] text-ink hover:border-gold-500 disabled:opacity-55"
              >
                {t("rishtaRoom.participants.admitAction", "Jodiye")}
              </button>
            </li>
          ))}
          {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}
        </ul>
      )}

      {admittable.length > 0 && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-1.5 text-[0.75rem] font-medium text-muted transition-colors hover:text-ink"
        >
          <UserPlus className="size-3.5" />
          {t("rishtaRoom.participants.addSomeoneAction", "Kisi ko is rishtey me jodiye")}
        </button>
      )}

      {participants.length > 0 && (
        <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-[0.75rem] leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
          {PARTICIPANT_DISCLOSURE}
        </p>
      )}
    </div>
  );
}
