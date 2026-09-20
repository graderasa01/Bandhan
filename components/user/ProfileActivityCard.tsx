import Link from "next/link";
import { Bookmark, Eye, Heart, Lock } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import StatTile from "@/components/ui/StatTile";
import type { ActivitySnapshot, AdmirerFace } from "@/lib/services/activity/admirerService";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";

/**
 * Activity the app has been recording since day one and showing to nobody.
 *
 * The count is always real and always visible — the upgrade sells the *names*,
 * never the number. A blurred row that secretly represents zero people is the
 * exact dark pattern M09 §14 forbids, so the face row only renders when there
 * is genuinely someone behind it.
 *
 * "Viewed You" and "Shortlisted You" render the same panel shape but sit
 * behind two different plan gates — see `admirerService.ts`'s module
 * docstring for why viewer identity (which includes rejected swipes) needs a
 * stricter one than shortlist identity.
 */
export default async function ProfileActivityCard({ activity }: { activity: ActivitySnapshot }) {
  const t = await getT();
  const { viewers, shortlisted, pendingInterests, faces, canSeeIdentity, viewerFaces, canSeeViewerIdentity, likesReceived, revealedLikes } =
    activity;

  if (viewers === 0 && shortlisted === 0 && pendingInterests === 0 && likesReceived === 0) {
    return (
      <div className="bt-card bt-card--flat h-full p-5 sm:p-6">
        <h3 className="bt-display text-[1.2rem] leading-snug">{t("user.profileActivityCard.title", "Aapki Profile Par Activity")}</h3>
        <p className="mt-2 text-sm text-muted">
          {t(
            "user.profileActivityCard.emptyState",
            "Abhi tak koi activity nahi. Jaise hi log aapki profile dekhenge, yahan dikhega — kisne dekha, kisne shortlist kiya.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="bt-card h-full p-5 sm:p-6">
      <h3 className="bt-display text-[1.2rem] leading-snug">{t("user.profileActivityCard.title", "Aapki Profile Par Activity")}</h3>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <StatTile icon={<Eye className="size-4" />} value={viewers} label={t("user.profileActivityCard.viewedYou", "Viewed You")} />
        <StatTile icon={<Bookmark className="size-4" />} value={shortlisted} label={t("user.profileActivityCard.shortlistedYou", "Shortlisted You")} highlight />
        <StatTile icon={<Heart className="size-4" />} value={pendingInterests} label={t("user.profileActivityCard.pendingInterests", "Pending Interests")} />
      </div>

      {/* Likes (D-91b) — a line, not a panel, because there is nothing to open.
          The number is real and this member is the only person in the world
          who can see it; the names do not exist to show unless a liker chose
          to be named, and those appear below in their own words. */}
      {likesReceived > 0 && (
        <div className="mt-4 rounded-lg bg-bg-subtle px-3.5 py-3">
          <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-ink">
            <Heart className="size-4 shrink-0 text-rose-500" aria-hidden />
            {t("user.profileActivityCard.likesReceived", "{n} logon ne aapko like kiya hai").replace(
              "{n}",
              String(likesReceived),
            )}
          </p>
          <p className="mt-1 text-[0.75rem] leading-snug text-muted">
            {t(
              "user.profileActivityCard.likesPrivate",
              "Like private hota hai — ye ginti sirf aapko dikhti hai, aur naam tab tak nahi jab tak wo khud na bataayein.",
            )}
          </p>
          {revealedLikes.length > 0 && (
            <p className="mt-2 text-[0.8125rem] leading-snug text-ink">
              {t("user.profileActivityCard.likesRevealed", "Inhone khud bataya:")}{" "}
              <span className="font-semibold">
                {revealedLikes.map((r) => r.displayName ?? t("matchReel.card.fallbackName", "Profile")).join(", ")}
              </span>
            </p>
          )}
        </div>
      )}

      <AdmirerPanel
        title={t("user.profileActivityCard.viewedYouPanelTitle", "Inhone aapki profile dekhi")}
        count={viewers}
        faces={viewerFaces}
        canSeeIdentity={canSeeViewerIdentity}
        lockedCopy={
          viewers === 1
            ? t("user.profileActivityCard.onePersonViewed", "Ek vyakti ne aapki profile dekhi hai.")
            : `${viewers}${t("user.profileActivityCard.nPeopleViewed", " logon ne aapki profile dekhi hai.")}`
        }
        t={t}
      />

      <AdmirerPanel
        title={t("user.profileActivityCard.shortlistedYouPanelTitle", "Inhone aapko shortlist kiya")}
        count={shortlisted}
        faces={faces}
        canSeeIdentity={canSeeIdentity}
        lockedCopy={
          shortlisted === 1
            ? t("user.profileActivityCard.onePersonShortlisted", "Ek vyakti ne aapko shortlist kiya hai.")
            : `${shortlisted}${t("user.profileActivityCard.nPeopleShortlisted", " logon ne aapko shortlist kiya hai.")}`
        }
        t={t}
      />
    </div>
  );
}

function AdmirerPanel({
  title,
  count,
  faces,
  canSeeIdentity,
  lockedCopy,
  t,
}: {
  title: string;
  count: number;
  faces: AdmirerFace[];
  canSeeIdentity: boolean;
  lockedCopy: string;
  t: Translate;
}) {
  if (count === 0) return null;

  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="bt-microlabel mb-3">{title}</p>

      {canSeeIdentity ? (
        <ul className="flex flex-wrap gap-3">
          {faces.map((f) => (
            <li key={f.key}>
              <Link
                href={`/user/profile/${f.profileId}`}
                className="flex w-16 touch-target flex-col items-center gap-1.5 text-center"
              >
                {/* Mounted in the page's gold hairline ring, 2px of ivory
                    between photo and ring — a portrait, not a thumbnail. */}
                <span className="bt-ring p-0.5 [--paper-ring-size:3.5rem]">
                  <Avatar name={f.displayName ?? "?"} photoUrl={f.photoUrl} size="md" />
                </span>
                <span className="w-full truncate text-[0.6875rem] text-muted">{f.displayName ?? t("user.profileActivityCard.profileFallback", "Profile")}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-3">
          <div aria-hidden className="flex -space-x-3">
            {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
              <span
                key={i}
                className="size-11 rounded-full border-2 border-surface bg-gradient-to-br from-primary/50 to-accent/50 blur-[5px]"
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] leading-snug text-muted">
              {lockedCopy} {t("user.profileActivityCard.passToSeeNames", "Naam Rishta Pass me dikhte hain.")}
            </p>
            <Link
              href="/user/subscription"
              className="bt-cta-ghost mt-2.5 inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] font-semibold transition-transform duration-200 hover:-translate-y-0.5"
            >
              <Lock className="size-3.5" />
              {t("user.profileActivityCard.viewProfiles", "View Profiles")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
