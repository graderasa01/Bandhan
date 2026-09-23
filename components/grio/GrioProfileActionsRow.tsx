"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, Orbit, UserRound, Users } from "lucide-react";
import { useGrio } from "./GrioProvider";
import type { GrioProfileAction, GrioPromptSuggestion } from "@/lib/contracts/grioProfile";

/**
 * The next step under a profile answer — every button an existing door.
 *
 *   open_section / open_kundli — the reel's own sheets when the member is on
 *     the reel and this person is still the one on screen (the reel registers
 *     them with GrioProvider); the profile page otherwise.
 *   view_profile — the profile page.
 *   ask — a follow-up question, sent as if typed.
 *
 * Catalog actions (Send interest) are not rendered here: they go through
 * `GrioActionChips`, which owns their confirm sheet — one confirm flow, not two.
 */
export default function GrioProfileActionsRow({
  profileId,
  actions,
  followUps,
  onAsk,
  disabled,
}: {
  profileId: string;
  actions: GrioProfileAction[];
  /** Question chips — only passed for the latest reply, so older turns stay quiet. */
  followUps: GrioPromptSuggestion[];
  onAsk: (question: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { close, pageActions } = useGrio();
  const doors = actions.filter((a) => a.kind !== "catalog");
  if (doors.length === 0 && followUps.length === 0) return null;

  function openProfilePage() {
    close();
    router.push(`/user/profile/${profileId}`);
  }

  function run(action: GrioProfileAction) {
    if (action.kind === "ask") {
      onAsk(action.prompt);
      return;
    }
    const screen = pageActions();
    if (action.kind === "open_kundli") {
      if (screen?.openKundli?.(profileId)) close();
      else openProfilePage();
      return;
    }
    if (action.kind === "open_section") {
      if (screen?.openSection?.(profileId, action.section)) close();
      else openProfilePage();
      return;
    }
    openProfilePage();
  }

  const icon = (a: GrioProfileAction) =>
    a.kind === "open_kundli" ? (
      <Orbit className="size-3.5" aria-hidden />
    ) : a.kind === "open_section" && a.section === "family" ? (
      <Users className="size-3.5" aria-hidden />
    ) : a.kind === "view_profile" ? (
      <UserRound className="size-3.5" aria-hidden />
    ) : null;

  return (
    <div className="flex max-w-full flex-col gap-2">
      {doors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {doors.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              onClick={() => run(a)}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 px-3 py-1.5 text-[0.75rem] font-medium text-gold-700 transition-colors hover:border-gold-500 disabled:opacity-50 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300"
            >
              {icon(a)}
              {a.label}
            </button>
          ))}
        </div>
      )}
      {followUps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {followUps.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              onClick={() => onAsk(s.ask)}
              className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink disabled:opacity-50"
            >
              {s.label}
              <ChevronRight className="size-3" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
