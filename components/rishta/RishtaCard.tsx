import Link from "next/link";
import {
  CalendarHeart,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock,
  Flag,
  MessageCircle,
  Send,
  Users,
} from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { daysAgoLabel } from "@/lib/profile/rishtaTime";
import { isPositiveOutcome } from "@/lib/profile/rishtaStages";
import type { NextStepActor, NextStepTarget } from "@/lib/profile/rishtaNextStep";
import type { RishtaBoardEntry } from "@/lib/services/rishta/rishtaListService";

/**
 * One rishta on the board.
 *
 * ## What replaced what
 *
 * This card exists because `MatchCard` could not be extended into it. That card
 * answers "who is this person" — photo, age, city, trust score, two buttons —
 * which is the right question on a discovery screen and the wrong one here.
 * Twenty of them in a grid is a catalogue, and a catalogue of people you are
 * already talking to tells you nothing you did not know.
 *
 * So the largest thing on this card is not the face. It is the sentence that
 * says what happens next and who has to do it, because that is the only thing
 * a person scanning twenty rishtey is actually looking for.
 *
 * ## Why the whole card is one link
 *
 * `MatchCard` carries two buttons (Message, Full Profile) and the board
 * deliberately carries none. Every action lives one tap deeper, in the Room,
 * where the rishta's own context is on screen — a "Message" button here would
 * send people into a chat thread with no memory of why they opened it.
 */

const TARGET_ICON: Record<NextStepTarget, typeof MessageCircle> = {
  chat: MessageCircle,
  topics: CircleDot,
  meeting: CalendarHeart,
  family: Users,
  stage: Flag,
  interests: Send,
  none: Clock,
};

/** Named, not colour-coded. "Aap" is a word; a red dot is a nag. */
const ACTOR_LABEL: Record<NextStepActor, string | null> = {
  you: "Aap",
  them: "Wo",
  both: "Dono",
  nobody: null,
};

export default function RishtaCard({ entry }: { entry: RishtaBoardEntry }) {
  const Icon = entry.stage === "CLOSED" ? CheckCircle2 : TARGET_ICON[entry.nextStep.target];
  const actor = ACTOR_LABEL[entry.nextStep.who];
  const ago = daysAgoLabel(entry.lastInteractionAt);
  const settled = isPositiveOutcome(entry.outcome);

  return (
    <Link
      href={`/user/rishta/${entry.otherUserId}`}
      className="group block rounded-lg border border-line bg-surface p-4 shadow-sm transition-colors hover:border-gold-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
    >
      <div className="flex items-start gap-3">
        <Avatar name={entry.name} photoUrl={entry.photoUrl} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="truncate font-semibold text-ink">
              {entry.name}
              {entry.age ? `, ${entry.age}` : ""}
            </h3>
            {entry.city && <span className="truncate text-xs text-muted">{entry.city}</span>}
          </div>

          <p className="mt-0.5 text-[0.75rem] text-muted">
            <span className={settled ? "font-medium text-trust" : undefined}>{entry.stageLabel}</span>
            {/* Same honesty the strip keeps: a stage the app worked out for
                itself is never presented as something the user said. */}
            {!entry.stageConfirmed && entry.stage !== "CLOSED" && " · app ka andaaza"}
          </p>
        </div>

        <ChevronRight className="mt-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-ink">
            {entry.nextStep.title}
            {actor && (
              <span
                className={`rounded-full px-1.5 py-px text-[0.625rem] font-semibold uppercase tracking-wide ${
                  entry.nextStep.who === "you"
                    ? "bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200"
                    : "bg-bg-subtle text-muted"
                }`}
              >
                {actor}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">{entry.nextStep.detail}</p>
        </div>
      </div>

      {(entry.totalMessages > 0 || ago) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted">
          {entry.totalMessages > 0 && <span>{entry.totalMessages} message</span>}
          {ago && <span>Aakhri baat {ago}</span>}
          {entry.familyInvolved && <span>Ghar walon ko pata hai</span>}
        </p>
      )}
    </Link>
  );
}
