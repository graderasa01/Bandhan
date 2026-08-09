import { redirect } from "next/navigation";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getConversationsData } from "@/lib/data/messagesData";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import ConversationListItem from "@/components/messages/ConversationListItem";
import Card from "@/components/ui/Card";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/messages");
  const t = await getT();

  // Messaging ships free for every matched user for now — no real
  // subscription/payment infra exists yet (see plan Context). Re-add a
  // dashboardData.subscription.status === "ACTIVE" gate here once M09 ships.
  const conversations = await getConversationsData(user.id);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-accent-text">{t("userPages.messages.title", "Messages")}</h1>
          <p className="mt-2 text-sm text-muted">{t("userPages.messages.subtitle", "Matched profiles ke saath chat.")}</p>
        </section>

        {conversations.length === 0 ? (
          <div className="mb-6 flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
            <span className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-primary-fg shadow-gold">
              <span aria-hidden className="absolute inset-0 rounded-full bg-primary/40 blur-xl" />
              <MessageCircle className="relative size-8" />
            </span>
            <div>
              <p className="text-lg font-semibold text-ink">
                {t("userPages.messages.emptyTitle", "Abhi koi conversation nahi hai.")}
              </p>
              <p className="mt-1.5 max-w-sm text-[0.875rem] leading-relaxed text-muted">
                {t(
                  "userPages.messages.emptyDescription",
                  "Match hone ke baad yahan conversations dikhenge — Rishta Reel explore karein.",
                )}
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
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" />
            {t(
              "userPages.messages.safetyNote",
              "Safe communication ke liye personal contact details chat me share na karein. Suspicious activity report karein.",
            )}
          </p>
        </Card>
      </div>
    </UserShell>
  );
}
