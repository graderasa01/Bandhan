import Link from "next/link";
import { ArrowRight, Bookmark, MessageSquareText, Users } from "lucide-react";
import { CornerFlourish } from "@/components/public/_shared/Ornaments";
import type { FamilyActivityItem } from "@/lib/services/family/familyService";
import { getT } from "@/lib/i18n/server";

/**
 * The retention hook the whole Family Circle feature exists for — seeing
 * "Papa ne Priya ko shortlist ki" pulls someone back into the app in a way no
 * push notification the app writes itself can. Nothing here is invented:
 * every row is a real shortlist-add or note a bound family session made.
 */
export default async function FamilyActivityCard({ items }: { items: FamilyActivityItem[] }) {
  if (items.length === 0) return null;
  const t = await getT();

  return (
    <div className="bt-card overflow-hidden p-5 sm:p-6">
      <CornerFlourish className="bt-vine right-0 top-0 size-16 -scale-x-100" />

      <div className="relative mb-4 flex items-center gap-3">
        <span className="bt-ring [--paper-ring-size:2.5rem]">
          <Users className="size-4" />
        </span>
        <h3 className="bt-display text-[1.1rem] leading-snug">{t("user.familyActivityCard.title", "Family Circle Se")}</h3>
      </div>
      <ul className="relative space-y-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 text-[0.875rem] leading-snug text-ink">
            <span className={`bt-ring [--paper-ring-size:1.75rem] ${item.kind === "SHORTLIST" ? "" : "bt-ring--trust"}`}>
              {item.kind === "SHORTLIST" ? (
                <Bookmark className="size-3.5" />
              ) : (
                <MessageSquareText className="size-3.5" />
              )}
            </span>
            <span className="pt-1">
              <strong>{item.familyMemberName}</strong> {t("user.familyActivityCard.ne", "ne")}{" "}
              {item.kind === "SHORTLIST" ? (
                <>
                  <strong>{item.targetDisplayName}</strong> {t("user.familyActivityCard.koShortlistKi", "ko shortlist ki")}
                </>
              ) : (
                <>
                  <strong>{item.targetDisplayName}</strong> {t("user.familyActivityCard.keBaareMeLikha", "ke baare me likha:")} &ldquo;{item.noteBody}&rdquo;
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/user/family"
        className="bt-cta-ghost group relative mt-4 inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] font-semibold transition-transform duration-200 hover:-translate-y-0.5"
      >
        {t("user.familyActivityCard.viewFamilyCircle", "View Family Circle")}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
