import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Download,
  Gift,
  Users,
  UserCheck,
  Clock,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import {
  getMemberReferralSummary,
  refreshReferralsFor,
} from "@/lib/services/referral/memberReferralService";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Progress from "@/components/ui/Progress";
import StatTile from "@/components/ui/StatTile";
import MemberInviteCard from "@/components/referral/MemberInviteCard";

/**
 * "Dost ko bulaayein" — the member referral screen.
 *
 * ## Why this page exists at all
 *
 * A matrimony product with few members has one honest way out and one
 * dishonest one. The dishonest one is to manufacture profiles so a new user's
 * deck looks full; that is a trust cheat this product has already refused
 * elsewhere (`pilotCityService` tells a buyer plainly when a city is empty
 * rather than inventing a partner). This is the honest one: give the real
 * members a reason to bring real people, and pay them in access rather than
 * cash so an abused invite costs unused Standard days and nothing else.
 *
 * ## The page is written to be checkable
 *
 * Every number on it is a row that exists, every bar is stated before it is
 * measured, and the reward's own conditions — including the referrer's half of
 * the deal — are printed on the same screen as the reward. A referral program
 * whose rules are only discoverable by failing them is a program that
 * generates support messages.
 */
export default async function ReferPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/refer");
  const t = await getT();

  // The belt to the hooks' braces: re-checks every pending invite before the
  // page renders, so a qualification that slipped past `submitProfile` and the
  // photo review is picked up by the person with the strongest reason to look.
  // Idempotent and swallows its own errors — see the service.
  await refreshReferralsFor(user.id);
  const summary = await getMemberReferralSummary(user.id);

  const towardNext = summary.referralsPerReward > 0 ? summary.towardNext : 0;
  const remaining = summary.referralsPerReward - towardNext;
  const percent =
    summary.referralsPerReward > 0 ? Math.round((towardNext / summary.referralsPerReward) * 100) : 0;

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-primary-fg shadow-gold">
            <Gift className="size-5" />
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-accent-text">
              {t("refer.title", "Dost ko bulaayein")}
            </h1>
            <p className="mt-1.5 text-base text-muted">
              {t(
                "refer.subtitle",
                "Aapka link share kijiye. Jo log aayein aur apni profile poori karein — unke liye rishtey badhte hain, aur aapko plan free milta hai.",
              )}
            </p>
          </div>
        </header>

        {!summary.enabled && (
          <Card variant="warning" padding="md" className="mb-4">
            <p className="text-sm font-semibold text-ink">
              {t("refer.paused.title", "Ye program abhi band hai")}
            </p>
            <p className="mt-1 text-[0.8125rem] text-muted">
              {t(
                "refer.paused.body",
                "Aapka link chalta rahega aur jo log aayenge wo gine bhi jaayenge — lekin naya reward abhi nahi milega. Jo reward pehle mil chuka hai wo waisa hi rahega.",
              )}
            </p>
          </Card>
        )}

        {summary.activeGrant && (
          <Card variant="trust" padding="md" className="mb-4">
            <p className="text-sm font-semibold text-trust">
              {t("refer.activeGrant.title", "Abhi chal raha hai")}: {summary.activeGrant.planName}
            </p>
            <p className="mt-1 text-[0.8125rem] text-muted">
              {summary.activeGrant.expiresAt.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}{" "}
              {t("refer.activeGrant.until", "tak — referral se mila hai, koi payment nahi lagi.")}
            </p>
          </Card>
        )}

        {/* The deal, stated before anything is measured. */}
        <Card variant="luxe" padding="lg" className="mb-4">
          <p className="text-sm text-muted">{t("refer.deal.label", "Deal")}</p>
          <p className="mt-1 text-lg font-semibold leading-snug text-ink">
            {t("refer.deal.line", "Aapke bulaye hue")} {summary.referralsPerReward}{" "}
            {t("refer.deal.line2", "log jinki profile poori ho jaaye")} ={" "}
            <span className="text-accent-text">
              {summary.rewardPlanName} {summary.rewardDays} {t("refer.deal.days", "din free")}
            </span>
          </p>
          {summary.maxRewards > 0 && (
            <p className="mt-2 text-[0.8125rem] text-muted">
              {t("refer.deal.cap", "Zyada se zyada")} {summary.maxRewards} {t("refer.deal.capSuffix", "baar")} —{" "}
              {t("refer.deal.earned", "abhi tak")} {summary.rewardsEarned}.
            </p>
          )}

          <div className="mt-4">
            {/* An unclaimed rung is shown full, never as the modulo. Somebody
                who has already brought three people must not be told "0/3"
                because their own photo is what is missing. */}
            <Progress
              value={summary.unclaimedRungs > 0 ? 100 : percent}
              label={
                summary.unclaimedRungs > 0
                  ? `${summary.referralsPerReward} / ${summary.referralsPerReward}`
                  : `${towardNext} / ${summary.referralsPerReward}`
              }
              showPercentage={false}
              variant={summary.ownGateMet ? "default" : "warning"}
            />
            <p className="mt-2 text-[0.8125rem] text-muted">
              {summary.unclaimedRungs > 0
                ? t(
                    "refer.progress.blocked",
                    "Aapke log gine ja chuke hain — reward tab milega jab aapki apni profile poori ho jaaye.",
                  )
                : summary.atCap
                  ? t("refer.progress.atCap", "Aapne is program ke saare reward le liye hain. Shukriya!")
                  : `${remaining} ${t("refer.progress.remaining", "aur — phir agla reward.")}`}
            </p>
          </div>
        </Card>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <StatTile
            icon={<Users className="size-4" />}
            value={summary.invited.length}
            label={t("refer.stats.joined", "Aaye")}
          />
          <StatTile
            icon={<UserCheck className="size-4" />}
            value={summary.rewardable}
            label={t("refer.stats.counted", "Gine gaye")}
            highlight
          />
          <StatTile
            icon={<Clock className="size-4" />}
            value={summary.pending}
            label={t("refer.stats.pending", "Profile baaki")}
          />
        </div>

        {/* The referrer's own half. Shown as a to-do list with a way out of
            each line, never as a greyed-out reward with no explanation. */}
        {!summary.ownGateMet && (
          <Card variant="warning" padding="lg" className="mb-4">
            <div className="flex items-start gap-2.5">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {t("refer.ownGate.title", "Reward ke liye aapka apna hissa baaki hai")}
                </p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                  {t(
                    "refer.ownGate.body",
                    "Aapke bulaye hue log gine jaate rahenge — reward tabhi milega jab aapki apni profile bhi poori ho. Ye isliye, kyunki program ka kaam hai asli profiles badhana, sirf naam jodna nahi.",
                  )}
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {summary.ownRequirements.map((req) => (
                    <li key={req.key} className="flex items-start gap-2 text-[0.8125rem]">
                      <span
                        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${
                          req.met ? "bg-trust/15 text-trust" : "bg-warn/15 text-warn"
                        }`}
                      >
                        {req.met ? <Check className="size-3" /> : <span className="text-[0.625rem]">!</span>}
                      </span>
                      <span className={req.met ? "text-muted line-through" : "text-ink"}>
                        {req.label}
                        {req.detail ? ` — ${req.detail}` : ""}
                        {!req.met && req.fixHref && (
                          <Link
                            href={req.fixHref}
                            className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-primary-text underline underline-offset-2"
                          >
                            {t("refer.ownGate.fix", "poori karein")}
                            <ArrowRight className="size-3" />
                          </Link>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}

        <MemberInviteCard code={summary.code} link={summary.link} shareText={summary.shareText} />

        <Card variant="elevated" padding="lg" className="mt-4 text-center">
          <p className="text-sm text-muted">
            {t("refer.qr.label", "QR code — family function me phone dikha kar scan karwa sakte hain")}
          </p>
          <div className="mx-auto mt-3 w-44 overflow-hidden rounded-md border border-line bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated per-member at request time */}
            <img src="/api/user/refer/qr?format=svg" alt={`Invite QR ${summary.code}`} className="w-full" />
          </div>
          <a
            href="/api/user/refer/qr?format=png"
            download
            className="mt-4 inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-primary-text underline underline-offset-2"
          >
            <Download className="size-4" />
            {t("refer.qr.download", "PNG download karein")}
          </a>
        </Card>

        {/* What counts, printed before it is measured. */}
        <Card variant="soft" padding="lg" className="mt-4">
          <p className="text-sm font-semibold text-ink">
            {t("refer.bar.title", "Ek invite kab gina jaata hai")}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {summary.joinerBar.map((line) => (
              <li key={line} className="flex items-start gap-2 text-[0.8125rem] text-muted">
                <Check className="mt-0.5 size-3.5 shrink-0 text-trust" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
            {t(
              "refer.bar.note",
              "Ek hi phone ya wifi se aaye kai log — reward ke liye ek hi gina jaata hai. Sirf naam jodne se kuch nahi hota; profile poori honi chahiye, kyunki asli profile hi kisi ke kaam aati hai.",
            )}
          </p>
        </Card>

        <h2 className="mb-3 mt-6 text-lg font-semibold text-ink">
          {t("refer.invited.title", "Aapke bulaye hue log")}
        </h2>
        {summary.invited.length === 0 ? (
          <Card variant="soft" padding="lg">
            <p className="text-sm text-ink">
              {t("refer.invited.emptyTitle", "Abhi koi nahi aaya.")}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
              {t(
                "refer.invited.emptyBody",
                "Upar wala link WhatsApp par bhej dijiye. Jaise hi koi judega, wo yahan dikhega.",
              )}
            </p>
          </Card>
        ) : (
          <div className="mb-6 flex flex-col gap-2">
            {summary.invited.map((row) => (
              <Card key={row.id} variant="soft" padding="sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                    <p className="text-[0.75rem] text-muted">
                      {row.joinedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {row.blocker ? ` — ${row.blocker}` : ""}
                    </p>
                  </div>
                  {row.status === "QUALIFIED" ? (
                    <Badge variant="complete" size="sm">
                      {t("refer.invited.qualified", "Gina gaya")}
                    </Badge>
                  ) : row.status === "DISQUALIFIED" ? (
                    <Badge variant="rejected" size="sm">
                      {t("refer.invited.disqualified", "Nahi gina")}
                    </Badge>
                  ) : (
                    <Badge variant="pending" size="sm">
                      {t("refer.invited.pending", "Profile baaki")}
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        <p className="mb-6 text-[0.75rem] leading-relaxed text-muted">
          {t(
            "refer.privacyFooter",
            "Aapko sirf itna dikhta hai: pehla naam aur profile poori hui ya nahi. Unki profile, photos, matches aur baatein aapko kabhi nahi dikhengi.",
          )}
        </p>
      </div>
    </UserShell>
  );
}
