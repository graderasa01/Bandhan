import { redirect } from "next/navigation";
import { Flame } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getTodayPollView, getVibeStreak } from "@/lib/services/vibe/pollService";
import { getSochBoard } from "@/lib/services/vibe/sochBoardService";
import { getGapQuestion } from "@/lib/services/deepProfile/deepProfileService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import UserShell from "@/components/layout/UserShell";
import GapQuestionCard from "@/components/profile/GapQuestionCard";
import PollCard from "@/components/vibe/PollCard";
import SochBoardList from "@/components/vibe/SochBoardList";
import SochBoardVisibilityToggle from "@/components/vibe/SochBoardVisibilityToggle";
import ShareSochBoardCard from "@/components/vibe/ShareSochBoardCard";
import Card from "@/components/ui/Card";

/** Phase C — Vibe Hub. See docs/bandhantak/10_engagement_and_monetization_architecture.md §5 (C1-C4, C6-C7). */
export default async function VibePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/vibe");

  const [arenaGate, gapQuestion] = await Promise.all([
    isFeatureAvailable(user.id, "mindsetArena"),
    getGapQuestion(user.id),
  ]);

  const [poll, streak, sochBoard] = arenaGate.allowed
    ? await Promise.all([getTodayPollView(user.id), getVibeStreak(user.id), getSochBoard(user.id, user.id)])
    : [null, 0, null];

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-accent-text">Vibe</h1>
            <p className="mt-1.5 text-base text-muted">
              Roz ek sawaal, ek poll — bina form bhare profile gehri hoti hai.
            </p>
          </div>
          {streak > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[0.8125rem] font-semibold text-primary-text">
              <Flame className="size-4" />
              {streak} din
            </span>
          )}
        </header>

        {gapQuestion && <GapQuestionCard question={gapQuestion} />}
        {poll && <PollCard poll={poll} />}

        {!gapQuestion && !poll && (
          <p className="mt-8 text-center text-[0.875rem] text-muted">
            Abhi ke liye sab jawab de diya — kal ek naya sawaal aur poll aayega.
          </p>
        )}

        {sochBoard && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-accent-text">Meri Soch Board</h2>
            <SochBoardVisibilityToggle initialVisible={poll?.sochBoardVisible ?? true} />

            <Card variant="soft" padding="md" className="mt-3">
              <p className="mb-2 text-[0.8125rem] font-medium text-ink">WhatsApp par share karein</p>
              <ShareSochBoardCard />
            </Card>

            <div className="mt-4">
              <SochBoardList
                entries={sochBoard.map((e) => ({
                  pollId: e.pollId,
                  question: e.question,
                  chosenOption: e.chosenOption,
                  voiceNote: e.voiceNote ? { mediaId: e.voiceNote.mediaId, seconds: e.voiceNote.seconds } : null,
                }))}
                mediaUrlPrefix="/api/media/"
              />
            </div>
          </section>
        )}
      </div>
    </UserShell>
  );
}
