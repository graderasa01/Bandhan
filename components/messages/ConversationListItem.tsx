import Link from "next/link";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import Pill from "@/components/ui/Pill";
import type { ConversationViewModel } from "@/lib/contracts/messages";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "abhi";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function ConversationListItem({ conversation }: { conversation: ConversationViewModel }) {
  const { matchId, other, lastMessage, unreadCount, updatedAt } = conversation;

  return (
    <Link href={`/user/messages/${matchId}`}>
      <Card variant="interactive" padding="sm" className="flex items-center gap-3">
        <Avatar name={other.displayName} photoUrl={other.photoUrl} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-ink">{other.displayName}</p>
            {other.verified && <span className="text-[0.6875rem] text-trust">✓</span>}
          </div>
          <p className={`truncate text-[0.8125rem] ${unreadCount > 0 ? "font-medium text-ink" : "text-muted"}`}>
            {lastMessage ? lastMessage.body : "Match ho gaya hai — baat shuru karein"}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[0.6875rem] text-subtle">{relativeTime(updatedAt)}</span>
          {unreadCount > 0 && (
            <Pill tone="gold" size="sm">
              {unreadCount}
            </Pill>
          )}
        </div>
      </Card>
    </Link>
  );
}
