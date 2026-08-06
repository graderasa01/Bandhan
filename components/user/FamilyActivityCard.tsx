import Link from "next/link";
import { Bookmark, MessageSquareText, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import type { FamilyActivityItem } from "@/lib/services/family/familyService";

/**
 * The retention hook the whole Family Circle feature exists for — seeing
 * "Papa ne Priya ko shortlist ki" pulls someone back into the app in a way no
 * push notification the app writes itself can. Nothing here is invented:
 * every row is a real shortlist-add or note a bound family session made.
 */
export default function FamilyActivityCard({ items }: { items: FamilyActivityItem[] }) {
  if (items.length === 0) return null;

  return (
    <Card padding="lg">
      <div className="mb-3 flex items-center gap-2">
        <Users className="size-4 shrink-0 text-primary-text" />
        <h3 className="text-sm font-semibold text-ink">Family Circle Se</h3>
      </div>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 text-[0.875rem] text-ink">
            {item.kind === "SHORTLIST" ? (
              <Bookmark className="mt-0.5 size-4 shrink-0 text-gold-600" />
            ) : (
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-trust" />
            )}
            <span>
              <strong>{item.familyMemberName}</strong> ne{" "}
              {item.kind === "SHORTLIST" ? (
                <>
                  <strong>{item.targetDisplayName}</strong> ko shortlist ki
                </>
              ) : (
                <>
                  <strong>{item.targetDisplayName}</strong> ke baare me likha: &ldquo;{item.noteBody}&rdquo;
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/user/family" className="mt-3 inline-block text-[0.8125rem] font-medium text-primary-text hover:text-primary-hover">
        View Family Circle →
      </Link>
    </Card>
  );
}
