import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getConversationsData } from "@/lib/data/messagesData";
import UserShell from "@/components/layout/UserShell";
import ConversationListItem from "@/components/messages/ConversationListItem";
import Card from "@/components/ui/Card";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/messages");

  // Messaging ships free for every matched user for now — no real
  // subscription/payment infra exists yet (see plan Context). Re-add a
  // dashboardData.subscription.status === "ACTIVE" gate here once M09 ships.
  const conversations = await getConversationsData(user.id);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Messages</h1>
          <p className="mt-2 text-sm text-muted">Matched profiles ke saath chat.</p>
        </section>

        {conversations.length === 0 ? (
          <div className="mb-6 flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
            <span className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
              <span aria-hidden className="absolute inset-0 rounded-full bg-gold-400/40 blur-xl" />
              <MessageCircle className="relative size-8" />
            </span>
            <div>
              <p className="text-lg font-semibold text-ink">Abhi koi conversation nahi hai.</p>
              <p className="mt-1.5 max-w-sm text-[0.875rem] leading-relaxed text-muted">
                Match hone ke baad yahan conversations dikhenge — Rishta Reel explore karein.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-6 flex flex-col gap-2">
            {conversations.map((c) => (
              <ConversationListItem key={c.matchId} conversation={c} />
            ))}
          </div>
        )}

        <Card variant="soft" padding="md">
          <p className="text-xs text-muted">
            🛡 Safe communication ke liye personal contact details chat me share na karein. Suspicious activity
            report karein.
          </p>
        </Card>
      </div>
    </UserShell>
  );
}
