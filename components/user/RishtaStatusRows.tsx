import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Eye,
  Gift,
  Heart,
  Lock,
  Megaphone,
  MessageCircle,
  MessageCircleQuestion,
  Mic,
  Sparkles,
} from "lucide-react";
import { Sparkle } from "@/components/public/_shared/Ornaments";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { ActivityInsightSlide } from "@/components/profile/AIInsightBanner";

/**
 * "My Rishte" as three short status rows — what the AIInsightBanner carousel
 * used to say one paragraph at a time, every seven seconds.
 *
 * Same slide data (`buildActivitySlides` on the dashboard page — the ranking,
 * the entitlement checks and the server-computed "2 ghante pehle" all stay
 * there), different shape: a row is one line, it does not move, and three of
 * them fit above the fold where a carousel showed one. Someone with a pending
 * Interest and an unread message sees both at a glance instead of waiting
 * for the slide to come round.
 *
 * Locked rows (a shortlist or a profile view whose identity the plan does not
 * include) keep the honest treatment the carousel had — blurred initial, a
 * lock, the row leads to the plan page. Hiding them would make the upgrade
 * invisible instead of tempting; inventing a name would be worse.
 *
 * Renders nothing when there is nothing — the reel hero above is the action
 * then, and a heading over an empty list would invent a chore.
 */

const ICONS = {
  sparkles: Sparkles,
  heart: Heart,
  bookmark: Bookmark,
  eye: Eye,
  mic: Mic,
  message: MessageCircle,
  question: MessageCircleQuestion,
  reward: Gift,
  announcement: Megaphone,
} as const;

/** The rows that are about a *rishta* — someone did something, or is waiting. */
const MAX_ROWS = 3;

/**
 * Which rows get a filled seal rather than the hairline ring. Two, and only
 * two: an admin's offer (someone chose to say this — wine) and a quest reward
 * (gold). Everything a person did keeps the ring, because the person's own
 * face or initial is the point of the row, not the icon.
 */
const SEAL: Partial<Record<ActivityInsightSlide["icon"], string>> = {
  announcement: "bt-ring--wine",
  reward: "bt-ring--gold",
};

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export default async function RishtaStatusRows({ slides }: { slides: ActivityInsightSlide[] }) {
  const rows = slides
    .filter((s) => s.kind === "activity")
    // Self-directed prompts (the day's gap question, the Mindset Arena poll)
    // are not rishta activity — nobody is on the other end. The gap question
    // has its own card further down; the poll lives on /user/vibe.
    .filter((s) => !s.id.startsWith("gap-question-") && !s.id.startsWith("vibe-poll-"))
    .slice(0, MAX_ROWS);

  if (rows.length === 0) return null;

  const t = await getT();

  return (
    <section aria-label={t("userPage.dashboard.rishtaRows.aria", "Mere rishte")}>
      <h2 className="bt-section-label mb-2.5">
        <Sparkle />
        {t("userPage.dashboard.rishtaRows.title", "Mere rishte")}
      </h2>

      {/* One card, hairlines between rows. A face sits inside the same gold
          hairline ring every icon on the page sits in — 2px of ivory between
          photo and ring, the way a portrait is mounted on an invitation. */}
      <div className="bt-card overflow-hidden">
        <ul className="bt-rows">
          {rows.map((row) => {
            const Icon = ICONS[row.icon];
            return (
              <li key={row.id}>
                <Link href={row.href ?? "/user/inbox"} className="bt-row group min-h-14">
                  {row.avatar ? (
                    <span
                      className={cn(
                        "bt-ring overflow-hidden p-0.5 text-[0.8125rem] font-semibold [--paper-ring-size:2.5rem]",
                        row.locked && "blur-[3px]",
                      )}
                      aria-hidden
                    >
                      {row.avatar.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.avatar.photoUrl} alt="" className="size-full rounded-full object-cover" />
                      ) : (
                        initial(row.avatar.name)
                      )}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "bt-ring [--paper-ring-size:2.5rem]",
                        row.locked ? "bt-ring--bare text-subtle" : SEAL[row.icon],
                      )}
                      aria-hidden
                    >
                      {row.locked ? <Lock className="size-4" /> : <Icon className="size-4" />}
                    </span>
                  )}

                  {/* Two lines on a phone, where a chip beside a one-line
                      truncation leaves six words of a sentence; one line
                      from sm up, where the row has the width to say it. */}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[0.875rem] font-medium leading-snug text-ink sm:line-clamp-1">
                      {row.text}
                    </span>
                    {row.at && <span className="block text-[0.75rem] text-subtle">{row.at}</span>}
                  </span>

                  {row.locked ? (
                    <span className="bt-chip bt-chip--muted shrink-0">
                      <Lock />
                      {t("userPage.dashboard.rishtaRows.unlock", "Unlock")}
                    </span>
                  ) : (
                    <ArrowRight
                      className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-text"
                      aria-hidden
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
