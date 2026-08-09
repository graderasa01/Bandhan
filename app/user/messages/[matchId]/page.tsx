import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getThreadData } from "@/lib/data/messagesData";
import { getContactShareState } from "@/lib/services/match/contactShare";
import { canSeeReadReceipts, isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { computeGhostingNudge, notifyGhostingNudge } from "@/lib/services/messages/ghostingShieldService";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import MessageThread from "@/components/messages/MessageThread";
import ContactShareCard from "@/components/messages/ContactShareCard";

export default async function MessageThreadPage({ params }: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/messages");
  const t = await getT();

  const { matchId } = await params;
  const thread = await getThreadData(user.id, matchId);
  if (!thread) notFound();

  // Resolved on the server: a locked state never carries the other number.
  const [contact, showReadReceipts, ghostingGate] = await Promise.all([
    getContactShareState(matchId, user.id),
    canSeeReadReceipts(user.id),
    isFeatureAvailable(user.id, "ghostingNudge"),
  ]);

  // Deliberately computed here (the page's one-shot server render), not
  // inside getThreadData — that function also backs the 4-second poll route,
  // and renudging on every poll tick would be exactly the confetti-inflation
  // mistake §7.2 warns against, just for a different feature.
  const rawLast = thread.messages.at(-1);
  const lastMessage = rawLast ? { senderId: rawLast.senderId, createdAt: new Date(rawLast.createdAt) } : null;
  const ghostingNudge = ghostingGate.allowed
    ? computeGhostingNudge(lastMessage, user.id, thread.other.displayName)
    : null;
  if (ghostingNudge && lastMessage) {
    void notifyGhostingNudge(
      {
        userId: user.id,
        matchId,
        otherName: thread.other.displayName,
        lastMessageAt: lastMessage.createdAt,
      },
      t,
    );
  }

  // Full-bleed for the same reason as Rishta Reel — an active conversation
  // shouldn't compete with sidebar/bottom-nav chrome. The header's back link
  // is the only way out.
  return (
    <UserShell userName={user.fullName} fullBleed>
      <MessageThread
        initial={thread}
        viewerId={user.id}
        showReadReceipts={showReadReceipts}
        ghostingNudge={ghostingNudge}
        contactSlot={
          <ContactShareCard matchId={matchId} state={contact} otherName={thread.other.displayName} />
        }
      />
    </UserShell>
  );
}
