import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Camera, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getProfileView } from "@/lib/data/profileViewData";
import { getSochBoard } from "@/lib/services/vibe/sochBoardService";
import { getPublicParentBlessing } from "@/lib/services/family/blessingService";
import { getMatchDeepProfileState } from "@/lib/services/deepProfile/deepProfileService";
import { getInboundQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { getKundliMatchView, milanUsedAssumedTime } from "@/lib/services/kundli/kundliMatch";
import { getFitBreakdown } from "@/lib/services/match/fitBreakdown";
import { getCompatibilityReport } from "@/lib/services/match/compatibilityData";
import CompatibilityLabCard from "@/components/match/CompatibilityLabCard";
import { canExplainMatch } from "@/lib/services/plans/entitlements";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import ProfileViewHeader from "@/components/profile/ProfileViewHeader";
import ProfileSectionList from "@/components/profile/ProfileSectionList";
import ProfileLevelStrip from "@/components/profile/ProfileLevelStrip";
import ProfileActionBar from "@/components/profile/ProfileActionBar";
import KundliNoteList from "@/components/profile/KundliNoteList";
import MatchFitCard from "@/components/profile/MatchFitCard";
import AskGrioAboutRishtaButton from "@/components/profile/AskGrioAboutRishtaButton";
import GunaMilanCard from "@/components/kundli/GunaMilanCard";
import SochBoardList from "@/components/vibe/SochBoardList";
import ParentBlessingPlayer from "@/components/family/ParentBlessingPlayer";
import SharedDeepProfileCard from "@/components/profile/SharedDeepProfileCard";
import SelfPhotoGallery from "@/components/profile/SelfPhotoGallery";
import ProfileOverviewCard from "@/components/profile/ProfileOverviewCard";
import PendingQuestions from "@/components/askBridge/PendingQuestions";

/**
 * The profile page the app never had.
 *
 * Before this, a Match changed exactly one thing: chat opened. `getMatchesData`
 * returned the same seven fields after acceptance as before it, so the funnel
 * ran backwards — the reel told you more about a stranger than the Matches
 * page told you about someone who had said yes.
 *
 * Every field shown here is chosen by `getProfileView` on the server. The
 * client is handed only what it may render, so nothing sensitive rides along
 * in the payload waiting for a CSS rule to hide it.
 */
export default async function ProfileViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/user/profile/${id}`);
  const t = await getT();

  const profile = await getProfileView(user.id, id, t);
  if (!profile) notFound();

  // Soch Board follows PARENT_BLESSING-style visibility (§5 C7) — the
  // profile's own L1/L2/L3 gating above doesn't apply to it, so this is a
  // second, independent lookup rather than something `getProfileView` folds in.
  const target = await prisma.profile.findUnique({ where: { id }, select: { userId: true } });
  const sochBoard = target ? await getSochBoard(target.userId, user.id) : null;
  // Same second-lookup pattern as Soch Board just above — Parent Blessing
  // follows profile visibility, not the L1/L2/L3 gating `getProfileView` computes.
  const blessing = target ? await getPublicParentBlessing(target.userId) : null;
  // Same second-lookup pattern again — L3-plus-opt-in-plus-plan, all three
  // gates live inside `getMatchDeepProfileState` itself (see its docstring).
  const deepProfileState = target ? await getMatchDeepProfileState(user.id, target.userId) : { state: "hidden" as const };
  // Only worth querying on your own profile — a stranger's pending questions
  // are theirs to answer, not something this page ever shows about them.
  const pendingQuestions = profile.isSelf ? await getInboundQuestions(user.id, t) : [];
  // Guna milan sits at exactly the standing the gotra/manglik notes already
  // had: shown about a profile the viewer chose to open, never about oneself,
  // and never anywhere near `pipeline.ts`. `getKundliMatchView` returns only
  // rashi/nakshatra-derived conclusions — the other side's birth time, date
  // and place never leave the server.
  const kundli = profile.isSelf ? null : await getKundliMatchView(user.id, id, t);
  const milanPrecision =
    kundli?.milan ? await milanUsedAssumedTime(user.id, id) : null;
  // The app's own reasoning, sitting next to the tradition's. Same standing as
  // guna milan above: computed about a profile the viewer chose to open, never
  // about oneself. `getFitBreakdown` re-runs `scoreCandidates` rather than
  // reading the stored `daily_reel_profiles` row, so this shows for a profile
  // reached from anywhere — shortlist, Circle, a link — not just from the reel.
  const [fitBreakdown, compatibility] = profile.isSelf
    ? [null, null]
    : await Promise.all([
        getFitBreakdown(user.id, id, t),
        // Free for every plan, like the fit card: it consumes MATCH_PRIVATE
        // answers but emits only derived meaning, and it names no answer of
        // theirs that the page does not already show. Grio sells the
        // conversation about it, not the comparison itself.
        getCompatibilityReport(user.id, id).catch(() => null),
      ]);
  // Gates only the Grio conversation, never the card above it — the breakdown
  // itself is free on every plan (see `canExplainMatch`).
  const canExplain = fitBreakdown ? await canExplainMatch(user.id) : false;

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-3xl space-y-4">
        <ProfileViewHeader profile={profile} />

        {profile.isSelf && (
          <>
            <SelfPhotoGallery />
            <ProfileOverviewCard />
            <PendingQuestions initial={pendingQuestions} />
            <Link
              href="/user/profile/preview"
              className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-gold-300 hover:bg-gold-50 dark:hover:bg-gold-900/20"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
                <Camera className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold text-ink">
                {t("userPages.profileView.previewReel", "Preview My Reel")}
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted" />
            </Link>
          </>
        )}

        <KundliNoteList notes={profile.kundliNotes} className="mt-0" />

        {compatibility && (
          <CompatibilityLabCard
            report={compatibility}
            otherName={profile.displayName}
            action={
              <AskGrioAboutRishtaButton
                profileId={profile.profileId}
                name={profile.displayName}
                canExplain={canExplain}
              />
            }
          />
        )}

        {fitBreakdown && (
          <MatchFitCard
            breakdown={fitBreakdown}
            otherName={profile.displayName}
          />
        )}

        {kundli?.milan && (
          <GunaMilanCard
            milan={kundli.milan}
            otherName={profile.displayName}
            approximate={Boolean(milanPrecision?.viewerAssumed || milanPrecision?.candidateAssumed)}
          />
        )}

        {kundli?.milanBlockedReason === "viewer-missing-dob" && (
          <Link
            href="/profile/build"
            className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-gold-300 hover:bg-gold-50 dark:hover:bg-gold-900/20"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
              <Sparkles className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold text-ink">
                {t("userPages.profileView.kundliCta", "Kundli milan dekhna hai?")}
              </span>
              <span className="block text-[0.8125rem] text-muted">
                {t(
                  "userPages.profileView.kundliCtaBody",
                  "Apni Date of Birth bhar dijiye — 36 guna ka hisaab apne aap ban jaayega.",
                )}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted" />
          </Link>
        )}

        {profile.lockedHint && <ProfileLevelStrip hint={profile.lockedHint} />}

        {blessing && <ParentBlessingPlayer mediaId={blessing.mediaId} seconds={blessing.seconds} />}

        <ProfileSectionList sections={profile.sections} />

        {deepProfileState.state !== "hidden" && <SharedDeepProfileCard state={deepProfileState} />}

        {sochBoard && sochBoard.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-wine-700">{t("userPages.profileView.sochBoard", "Soch Board")}</h2>
            <SochBoardList
              entries={sochBoard.map((e) => ({
                pollId: e.pollId,
                question: e.question,
                chosenOption: e.chosenOption,
                voiceNote: e.voiceNote ? { mediaId: e.voiceNote.mediaId, seconds: e.voiceNote.seconds } : null,
              }))}
              mediaUrlPrefix="/api/media/"
            />
          </section>
        )}

        <ProfileActionBar profile={profile} />
      </div>
    </UserShell>
  );
}
