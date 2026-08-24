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
import RishtaStageStrip from "@/components/rishta/RishtaStageStrip";
import { getRishtaSummary } from "@/lib/services/rishta/journeyService";

export default async function MessageThreadPage({ params }: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/messages");
  const t = await getT();

  const { matchId } = await params;
  const thread = await getThreadData(user.id, matchId);
  if (!thread) notFound();

  // Resolved on the server: a locked state never carries the other number.
  const [contact, showReadReceipts, ghostingGate, journey] = await Promise.all([
    getContactShareState(matchId, user.id),
    canSeeReadReceipts(user.id),
    isFeatureAvailable(user.id, "ghostingNudge"),
    // Best-effort: an unreachable journey costs the strip, never the thread.
    getRishtaSummary(user.id, thread.other.userId).catch((err) => {
      console.error("[rishta] summary failed:", err instanceof Error ? err.message : String(err));
      return null;
    }),
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
          <>
            {/* Above the contact card because it answers the earlier question:
                where has this reached, and what is still unresolved. Rendered
                through the existing slot rather than a new prop — the thread
                component has no opinion about either card, and adding a second
                pass-through would be ceremony for no gain. */}
            {journey && <RishtaStageStrip initial={journey} />}
            <ContactShareCard matchId={matchId} state={contact} otherName={thread.other.displayName} />
          </>
        }
      />
    </UserShell>
  );
}
