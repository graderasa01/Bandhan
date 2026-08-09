import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BadgeCheck, CalendarHeart, Clock, Eye, Scale, ShieldCheck, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getCircleView, markAttendance } from "@/lib/services/circle/circleService";
import { MAX_GENDER_RATIO } from "@/lib/services/circle/circleEventService";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import CircleCountdown from "@/components/circle/CircleCountdown";
import CircleEntryPanel from "@/components/circle/CircleEntryPanel";
import CircleConnectionCard from "@/components/circle/CircleConnectionCard";
import FeatureGrid from "@/components/ui/FeatureChip";
import InfoTip from "@/components/ui/InfoTip";

/**
 * Phase F — Serious Circle.
 *
 * Wednesday and Sunday, 8–10pm IST. See lib/circle/schedule.ts for why the
 * slots are constants, and lib/services/circle/circleEventService.ts for why
 * the whole lifecycle runs without a scheduler.
 */
export default async function CirclePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/circle");

  const gate = await isFeatureAvailable(user.id, "seriousCircle");
  if (!gate.allowed) redirect("/user/dashboard");

  // Attendance is recorded by *being here* inside the live window, never by
  // tapping "I'm here" — turning up is the product's entire definition of
  // serious, so it cannot be a self-report. Runs before the view so the badge
  // and roster below already reflect it.
  await markAttendance(user.id);
  const t = await getT();
  const view = await getCircleView(user.id, new Date(), t);

  const { event, roster, badge, connections } = view;
  const live = event?.status === "LIVE";
  const registrationOpen = event?.status === "SCHEDULED";

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-accent-text">
                Serious Circle
              </h1>
              <p className="mt-1.5 text-base text-muted">
                {t(
                  "userPage.circle.subtitle",
                  "Budhwaar aur Ravivaar, raat 8–10. Sirf wo log jinhe sach me shaadi karni hai.",
                )}
              </p>
            </div>
            {badge.active && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[0.8125rem] font-semibold text-primary-text">
                <BadgeCheck className="size-4" />
                Shaadi Ready
              </span>
            )}
          </div>
        </header>

        {!event && (
          <Card variant="soft" padding="md">
            <p className="text-[0.875rem] text-muted">
              {t("userPage.circle.notScheduled", "Agla Circle abhi schedule nahi hua. Thodi der me dekhiye.")}
            </p>
          </Card>
        )}

        {event && (
          <Card variant="elevated" padding="md" className="mb-4">
            <div className="flex items-center gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-primary to-primary-hover text-primary-fg shadow-gold">
                <CalendarHeart className="size-5" />
              </span>
              <div>
                <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-accent-text">
                  {live
                    ? t("userPage.circle.liveNow", "Abhi chal raha hai")
                    : t("userPage.circle.nextCircle", "Agla Circle")}
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-bold text-ink">
                  {event.slotLabel}
                </p>
              </div>
            </div>

            {registrationOpen && (
              <div className="mt-4 rounded-lg bg-primary/10 p-3.5">
                <CircleCountdown
                  target={event.registrationClosesAt}
                  label={t("userPage.circle.regClosesIn", "Registration band hone me")}
                />
                <p className="mt-2.5 flex items-center gap-1.5 text-[0.75rem] text-muted">
                  {t("userPage.circle.rosterLockLine", "Roster 24 ghante pehle lock hota hai.")}
                  <InfoTip
                    text={t(
                      "userPage.circle.rosterLockTip",
                      "Event se 24 ghante pehle roster lock ho jata hai. Uske baad koi nahi jud sakta — yahi is Circle ko serious rakhta hai.",
                    )}
                  />
                </p>
              </div>
            )}

            {event.status === "LOCKED" && (
              <div className="mt-4 rounded-lg bg-primary/10 p-3.5">
                <CircleCountdown target={event.startsAt} label={t("userPage.circle.opensIn", "Circle khulne me")} />
              </div>
            )}

            {live && (
              <div className="mt-4 rounded-lg bg-primary/10 p-3.5">
                <CircleCountdown target={event.endsAt} label={t("userPage.circle.closesIn", "Circle band hone me")} />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-3 py-1.5 text-[0.8125rem] font-medium text-ink">
                <Users className="size-3.5 text-primary-text" />
                <strong className="font-semibold">{roster.total}</strong>{" "}
                {t("userPage.circle.peopleReady", "log tayyar hain")}
              </span>
              {Object.entries(roster.byGender).map(([gender, count]) => (
                <span
                  key={gender}
                  className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[0.8125rem] text-muted"
                >
                  {gender}: <strong className="text-ink">{count}</strong>
                </span>
              ))}
            </div>

            {registrationOpen && roster.total < view.minParticipants && (
              <p className="mt-3 flex items-start gap-2 rounded-md border border-warn/25 bg-warn-bg px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
                <span>
                  {view.minParticipants}
                  {t("userPage.circle.minCountPre", " log hone par hi Circle chalega — abhi ")}
                  {view.minParticipants - roster.total}
                  {t(
                    "userPage.circle.minCountPost",
                    " aur chahiye. Itne na hue to ye Circle cancel ho jayega aur aapka naam apne aap agle Circle me chala jayega — dobara register karne ki zaroorat nahi.",
                  )}
                </span>
              </p>
            )}
          </Card>
        )}

        {event && !live && event.status !== "COMPLETED" && <CircleEntryPanel view={view} />}

        {live && connections.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-1 text-lg font-semibold text-accent-text">
              {t("userPage.circle.yourPeoplePre", "Aapke ")}
              {connections.length}
              {t("userPage.circle.yourPeoplePost", " log")}
            </h2>
            <p className="mb-3 text-[0.8125rem] text-muted">
              {t(
                "userPage.circle.bothYesNote",
                "Dono ne haan ki to hi connection banega. Unhe pata nahi chalega ki aapne kya chuna.",
              )}
            </p>
            <div className="space-y-3">
              {connections.map((conn) => (
                <CircleConnectionCard key={conn.id} conn={conn} />
              ))}
            </div>
          </section>
        )}

        {live && connections.length === 0 && (
          <Card variant="soft" padding="md">
            <p className="flex items-center gap-1.5 text-[0.875rem] font-medium text-ink">
              Is baar koi jodi nahi ban paayi
              {/* Naming the likely cause instead of shrugging, via InfoTip
                  rather than a printed paragraph — a roster is only ~20–60
                  people, so the usual reason is a narrow stated preference
                  (most often an age range), not bad luck, and that's
                  something the user can actually fix before Sunday. */}
              <InfoTip text="Circle me aaye logon me se koi aapki partner preferences par khara nahi utra. Aksar wajah umar ki range hoti hai — thoda khol dein to agle Circle me kaafi zyada log dikhenge." />
            </p>
            <Link
              href="/profile/build"
              className="mt-2 inline-block text-[0.8125rem] font-semibold text-primary-text underline underline-offset-2"
            >
              Check my preferences
            </Link>
          </Card>
        )}

        {event?.status === "COMPLETED" && connections.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-lg font-semibold text-accent-text">Pichhle Circle se</h2>
            <div className="space-y-3">
              {connections.map((conn) => (
                <CircleConnectionCard key={conn.id} conn={conn} />
              ))}
            </div>
          </section>
        )}

        {badge.suspendedUntil && badge.suspendedUntil > new Date() && (
          <Card variant="warning" padding="md" className="mt-4">
            <p className="text-[0.875rem] font-medium text-ink">{t("circle.page.badgeSuspended", "Badge abhi band hai")}</p>
            <p className="mt-1 text-[0.8125rem] text-muted">
              {badge.suspendReason}. {t("circle.page.badgeAutoRestore", "Apne aap wapas aa jayega.")}
            </p>
          </Card>
        )}

        <Card variant="soft" padding="md" className="mt-6">
          <p className="mb-3 text-[0.75rem] font-semibold uppercase tracking-wide text-accent-text">
            Circle kaise chalta hai
          </p>
          <FeatureGrid
            items={[
              {
                icon: ShieldCheck,
                label: "Verification se entry",
                detail: "Entry paise se nahi milti — profile, verification, family aur samay se milti hai.",
              },
              {
                icon: Clock,
                label: "24hr pehle registration band",
                detail: "Event se 24 ghante pehle registration band ho jata hai. Roster lock.",
              },
              {
                icon: Scale,
                label: `${MAX_GENDER_RATIO}:1 tak hi balance`,
                detail: `Ladka-ladki ka balance ${MAX_GENDER_RATIO}:1 se zyada nahi hota, warna dono ka nuksan hai.`,
              },
              {
                icon: Eye,
                label: "5 log ek room me",
                detail: "Room me sirf 5 log dikhte hain. Dono haan karein to 48 ghante free baat.",
              },
              {
                icon: BadgeCheck,
                label: "30 din ka Shaadi Ready badge",
                detail: "Aane par 30 din ka Shaadi Ready badge. Connect hoke chup rehne par 2 hafte band.",
              },
            ]}
          />
        </Card>
      </div>
    </UserShell>
  );
}
