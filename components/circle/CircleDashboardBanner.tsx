import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarHeart, Users } from "lucide-react";
import type { CircleTeaser } from "@/lib/services/circle/circleService";

/**
 * The Circle's entry point on the dashboard.
 *
 * Four states, in descending urgency — the copy is the whole job here, so each
 * one says a different thing rather than reusing a generic "Serious Circle"
 * headline with a changing subtitle:
 *
 *   LIVE + pairings waiting  → the room is open and people are waiting on *you*
 *   registered, not started  → your seat is booked, here's when
 *   registration open        → an invitation, with the gate progress if it isn't clear yet
 *   locked / already ran     → the next one, stated plainly
 *
 * A user who cannot enter still sees the banner. Hiding it from them would
 * hide the one thing worth aspiring to — and the gate progress ("3 / 5 ho
 * gaya") is a better upgrade prompt than any pitch, because it is about them.
 */
export default function CircleDashboardBanner({ teaser }: { teaser: CircleTeaser }) {
  const live = teaser.status === "LIVE";
  const registrationOpen = teaser.status === "SCHEDULED";

  const { title, subtitle } = copyFor(teaser, live, registrationOpen);
  const urgent = live && teaser.awaitingMe > 0;

  return (
    <Link
      href="/user/circle"
      className={
        urgent
          ? "group mb-6 flex items-center gap-4 rounded-lg border border-gold-400/60 bg-gradient-to-br from-wine-700 to-wine-800 p-5 text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
          : "group mb-6 flex items-center gap-4 rounded-lg border border-gold-300/60 bg-gradient-to-br from-gold-50 to-surface p-5 transition-all hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-md dark:from-gold-900/25 dark:to-surface"
      }
    >
      <span
        className={
          urgent
            ? "grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg shadow-gold"
            : "grid size-11 shrink-0 place-items-center rounded-full border border-gold-400/50 bg-surface text-gold-700"
        }
      >
        <CalendarHeart className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={urgent ? "block text-base font-semibold" : "block text-base font-semibold text-wine-700"}>
            {title}
          </span>
          {teaser.badgeActive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-gold-800 dark:bg-gold-900/40 dark:text-gold-200">
              <BadgeCheck className="size-3" />
              Shaadi Ready
            </span>
          )}
        </span>

        <span className={urgent ? "block text-[0.8125rem] leading-snug text-gold-100/90" : "block text-[0.8125rem] leading-snug text-muted"}>
          {subtitle}
        </span>

        {registrationOpen && teaser.rosterTotal > 0 && (
          <span className={urgent ? "mt-1 flex items-center gap-1.5 text-[0.75rem] text-gold-100/80" : "mt-1 flex items-center gap-1.5 text-[0.75rem] text-subtle"}>
            <Users className="size-3.5" />
            {teaser.rosterTotal} log tayyar hain
          </span>
        )}
      </span>

      <ArrowRight
        className={
          urgent
            ? "size-5 shrink-0 text-gold-200 transition-transform group-hover:translate-x-1"
            : "size-5 shrink-0 text-gold-600 transition-transform group-hover:translate-x-1"
        }
      />
    </Link>
  );
}

function copyFor(teaser: CircleTeaser, live: boolean, registrationOpen: boolean) {
  if (live && teaser.awaitingMe > 0) {
    return {
      title: "Circle abhi khula hai",
      subtitle: `${teaser.awaitingMe} log aapke jawab ka intezaar kar rahe hain — room 10 baje band ho jayega.`,
    };
  }

  if (live) {
    return {
      title: "Serious Circle chal raha hai",
      subtitle: teaser.registered
        ? "Aap andar hain. Apne log dekhne ke liye kholiye."
        : "Aaj ka Circle chal raha hai — agle ke liye naam likhwaiye.",
    };
  }

  if (teaser.registered) {
    return {
      title: "Aapki Circle seat pakki hai",
      subtitle: `${teaser.slotLabel}. Us waqt aana zaroori hai — aana hi is Circle ka sabse bada proof hai.`,
    };
  }

  if (teaser.waitlisted) {
    return {
      title: "Is baar waiting list me",
      subtitle: "Seats balance karne ke liye kuch log shift hue hain. Agle Circle me aapka number pehle hai.",
    };
  }

  if (registrationOpen && teaser.eligible) {
    return {
      title: `${teaser.slotLabel} ko Serious Circle hai`,
      subtitle: "Sirf wo log jinhe sach me shaadi karni hai. Aap tayyar hain — seat reserve kar lijiye.",
    };
  }

  if (registrationOpen) {
    return {
      title: `${teaser.slotLabel} ko Serious Circle hai`,
      subtitle: `Entry paise se nahi, tayyari se milti hai — abhi ${teaser.passedCount} / ${teaser.totalCount} ho gaya hai.`,
    };
  }

  return {
    title: "Agla Serious Circle",
    subtitle: `${teaser.slotLabel}. Registration khulte hi aapko yahin dikh jayega.`,
  };
}
