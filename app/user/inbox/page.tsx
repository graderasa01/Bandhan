import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getNotices } from "@/lib/services/notice/noticeService";
import { getReceivedVoiceNotes } from "@/lib/services/voice/voiceNoteService";
import { getInboundQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import UserShell from "@/components/layout/UserShell";
import NoticeList from "@/components/notice/NoticeList";
import PushOptIn from "@/components/notice/PushOptIn";
import ReceivedVoiceNotes from "@/components/voice/ReceivedVoiceNotes";
import PendingQuestions from "@/components/askBridge/PendingQuestions";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/inbox");

  const [notices, voiceNotes, pendingQuestions, plan] = await Promise.all([
    getNotices(user.id),
    getReceivedVoiceNotes(user.id),
    getInboundQuestions(user.id),
    getPlanContext(user.id),
  ]);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700">
            Aapke liye
          </h1>
          <p className="mt-1.5 text-base text-muted">
            Jo bhi aapki profile par hua — ek jagah.
          </p>
        </header>

        {/* Above the feed, but below nothing else — this is the screen where a
            user has just discovered they missed something, which is the one
            moment "app band ho tab bhi khabar milti rahe" is an offer rather
            than an interruption. It hides itself entirely once turned on
            elsewhere, or when the browser can't do push. */}
        <PushOptIn className="mb-4" />

        {/* Questions and voice notes sit above the feed: they are objects to
            act on, not events to read, and a locked one is the single most
            time-sensitive thing in this screen. */}
        <PendingQuestions initial={pendingQuestions} />

        <ReceivedVoiceNotes
          initial={voiceNotes}
          canUnlockFree={plan.features.voiceUnlock}
          unlockCredits={plan.credits.VOICE_UNLOCK}
        />

        <NoticeList initial={notices} />
      </div>
    </UserShell>
  );
}
