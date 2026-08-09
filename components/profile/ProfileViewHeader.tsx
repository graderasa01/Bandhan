import { BadgeCheck, ImageOff, Lock, Phone, ShieldCheck } from "lucide-react";
import Badge from "@/components/ui/Badge";
import PhotoSlideDeck from "@/components/profile/PhotoSlideDeck";
import PhotoUnlockCta from "@/components/subscription/PhotoUnlockCta";
import type { ProfileViewModel } from "@/lib/contracts/profileView";
import { getT } from "@/lib/i18n/server";

/**
 * Photo obeys exactly the rule the reel and shortlist already enforce, which
 * since 2026-08-07 is "L3 (a real Match), or any paid plan" — see
 * `photoUnlockAll` in lib/constants/plans.ts. The locked panel says why in the
 * same words the reel card uses, so a user who swiped past this person
 * yesterday reads the identical sentence today.
 */
export default async function ProfileViewHeader({ profile }: { profile: ProfileViewModel }) {
  const t = await getT();
  const { displayName, age, city, headline, photoUrl, photoUnlocked, photoFocalY } = profile;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
      <div className="relative aspect-[4/3] bg-gradient-to-br from-wine-100 via-gold-100 to-sand-200 sm:aspect-[16/9] dark:from-wine-900 dark:via-gold-900 dark:to-sand-800">
        {photoUnlocked && photoUrl ? (
          // No trailing text slide here — unlike the reel, this page already
          // prints the full bio as static text below (see the blockquote
          // further down), so appending it as a slide would just repeat it.
          <PhotoSlideDeck
            slides={profile.slides}
            bioNote={null}
            fallbackPhotoUrl={photoUrl}
            fallbackFocalY={photoFocalY}
            displayName={displayName}
            priority
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-surface/80 backdrop-blur-sm">
                {photoUnlocked ? (
                  <ImageOff className="size-5 text-muted" />
                ) : (
                  <Lock className="size-5 text-muted" />
                )}
              </span>
              <p className="max-w-[220px] text-[0.75rem] leading-snug text-sand-700 dark:text-sand-300">
                {/* Two different absences, and conflating them tells a lie:
                    at L3 the gate is already open, so blaming "mutual interest"
                    for an empty slot invents a restriction that isn't there. */}
                {photoUnlocked
                  ? t("profile.viewHeader.noPhotoYet", "{name} ne abhi tak photo nahi daali").replace(
                      "{name}",
                      displayName,
                    )
                  : t("profile.viewHeader.photoLocked", "Photo mutual interest ya subscription ke baad dikhegi")}
              </p>
              {/* Only on the locked branch — the offer makes no sense next to
                  a profile that simply has no photo to show. */}
              {!photoUnlocked && (
                <PhotoUnlockCta className="rounded-full bg-surface/85 px-3 text-[0.8125rem] backdrop-blur-sm hover:bg-surface hover:no-underline" />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            {displayName}
            {age != null && `, ${age}`}
          </h1>
          {profile.photoVerified && (
            <Badge variant="verified" icon={<BadgeCheck />}>
              {t("profile.viewHeader.photoVerified", "Photo verified")}
            </Badge>
          )}
          {profile.mobileVerified && (
            <Badge variant="complete" icon={<Phone />}>
              {t("profile.viewHeader.mobileVerified", "Mobile verified")}
            </Badge>
          )}
        </div>

        {(city || headline) && (
          <p className="mt-1 text-[0.9375rem] text-muted">
            {[city, headline].filter(Boolean).join(" · ")}
          </p>
        )}

        {profile.bio && (
          <p className="mt-3 border-l-2 border-gold-300 pl-3 text-[0.9375rem] leading-relaxed text-ink dark:border-gold-700">
            {profile.bio}
          </p>
        )}

        {profile.trustScore != null && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-trust/10 px-3 py-1.5 text-[0.8125rem] font-medium text-trust">
            <ShieldCheck className="size-4" />
            {t("profile.viewHeader.trustScore", "Trust score {score}").replace("{score}", String(profile.trustScore))}
            {profile.trustScoreLabel && ` · ${profile.trustScoreLabel}`}
          </p>
        )}
      </div>
    </div>
  );
}
