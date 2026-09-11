import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Brain,
  ChevronDown,
  CreditCard,
  Eye,
  FileText,
  Handshake,
  KeyRound,
  Megaphone,
  Orbit,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { activateIfReady } from "@/lib/services/profile/readinessService";
import { getUserDashboardData } from "@/lib/data/userDashboardData";
import { getOwnChart } from "@/lib/services/kundli/kundliMatch";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import { RuleMotif, Sparkle } from "@/components/public/_shared/Ornaments";
import TrustScoreCard from "@/components/profile/TrustScoreCard";
import ProfileIntelligenceCard from "@/components/profile/ProfileIntelligenceCard";
import SubscriptionStatusCard from "@/components/profile/SubscriptionStatusCard";
import DemandMeterCard from "@/components/user/DemandMeterCard";
import ProfileActivityCard from "@/components/user/ProfileActivityCard";
import AINextStepCard from "@/components/profile/AINextStepCard";
import { cn } from "@/lib/utils";

// The root layout appends "· BandhanTak" — don't repeat it here.
export const metadata: Metadata = {
  title: "Me & Trust",
};

/**
 * The Me & Trust hub — the fifth space's own front door.
 *
 * Everything the dashboard used to carry that was *about the user* rather than
 * about today — trust score, profile intelligence, plan, demand meter, biodata,
 * kundli, privacy — lives here as short status rows, each one a page that
 * already existed. The dashboard keeps "what should I do now"; the profile
 * view keeps "what others see"; this screen answers "how ready and how
 * protected am I".
 *
 * Rows first, cards second. The richer cards (trust factors, intelligence
 * layers, demand levers) are real and kept, but behind one "Details" tap so the
 * hub opens on a screen a thumb can scan, not a wall.
 *
 * `force-dynamic` because every number is this user's own state.
 */
export const dynamic = "force-dynamic";

interface Row {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One short status, right-aligned. Real data only — omitted rather than faked. */
  status?: string | null;
  tone?: "trust" | "warn" | "muted";
}

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/me");

  const t = await getT();
  const profile = await getOrCreateProfile(user.id);
  const { view } = await activateIfReady(user.id, profile);
  const isLive = view.activatedOnServer;

  // Best-effort, like the dashboard: one hiccuping count must not blank the
  // whole hub. The rows render with whatever loaded; the cards need the data.
  const [data, chart] = await Promise.all([
    getUserDashboardData(user, t).catch((err) => {
      console.error("[me] dashboard data failed:", err instanceof Error ? err.message : String(err));
      return null;
    }),
    getOwnChart(user.id).catch(() => null),
  ]);

  const trustScore = data?.trust.score ?? null;
  const completion = data?.profile.completionPercentage ?? view.readiness.done;
  const plan = data?.subscription ?? null;

  const kundliStatus = !chart
    ? t("userPage.me.kundliNeedsDob", "DOB chahiye")
    : chart.precision === "full"
      ? t("userPage.me.kundliFull", "Lagna sahit")
      : chart.precision === "no-place"
        ? t("userPage.me.kundliNoPlace", "Janm sthaan baaki")
        : t("userPage.me.kundliNoTime", "Janm samay baaki");

  const groups: { id: string; title: string; rows: Row[] }[] = [
    {
      id: "profile",
      title: t("userPage.me.groupProfile", "Profile"),
      rows: [
        { href: "/user/profile/me", label: "View Profile", icon: Eye },
        {
          href: "/profile/build",
          label: "Edit Profile",
          icon: UserIcon,
          status: isLive
            ? `${completion}%`
            : t("userPage.me.profileNotLive", "Abhi live nahi"),
          tone: isLive ? "muted" : "warn",
        },
        { href: "/user/profile/preview", label: "Preview Reel Card", icon: Sparkles },
      ],
    },
    {
      id: "trust",
      title: t("userPage.me.groupTrust", "Trust & Verification"),
      rows: [
        {
          href: "/user/profile-trust-score",
          label: "Trust Score",
          icon: ShieldCheck,
          status: trustScore === null ? null : `${trustScore}/100`,
          tone: trustScore !== null && trustScore >= 60 ? "trust" : "warn",
        },
        { href: "/user/verification", label: "Verification", icon: BadgeCheck },
        { href: "/user/verify-contact", label: "Verify Contact", icon: Smartphone },
      ],
    },
    {
      id: "tools",
      title: t("userPage.me.groupTools", "Profile Tools"),
      rows: [
        { href: "/user/kundli", label: "My Kundli", icon: Orbit, status: kundliStatus, tone: chart?.precision === "full" ? "trust" : "muted" },
        { href: "/user/biodata", label: "Biodata PDF", icon: FileText },
        { href: "/user/profile/intelligence", label: "Intelligence", icon: Brain, status: data ? `${data.profileIntelligence.completedLayers}/${data.profileIntelligence.totalLayers} layers` : null, tone: "muted" },
        { href: "/user/deep-profile", label: "Deep Profile", icon: Sparkles },
      ],
    },
    {
      id: "privacy",
      title: t("userPage.me.groupPrivacy", "Privacy"),
      rows: [
        { href: "/user/profile/access", label: "Profile Access", icon: KeyRound, status: t("userPage.me.accessHint", "Incognito, kaun dekh sakta hai"), tone: "muted" },
        { href: "/user/app-setup", label: "App Setup", icon: Smartphone, status: t("userPage.me.appSetupHint", "PIN lock, install"), tone: "muted" },
      ],
    },
    {
      id: "plan",
      title: t("userPage.me.groupPlan", "Plan & Services"),
      rows: [
        {
          href: "/user/subscription",
          label: "Plan",
          icon: CreditCard,
          status: plan
            ? plan.status === "ACTIVE" && plan.currentPlan
              ? plan.currentPlan
              : t("userPage.me.planFree", "Free")
            : null,
          tone: plan?.status === "ACTIVE" ? "trust" : "muted",
        },
        { href: "/user/services", label: "My Services", icon: Handshake },
        { href: "/user/boost", label: "Boost", icon: Rocket },
        { href: "/user/spotlight", label: "Spotlight", icon: Megaphone },
        { href: "/user/concierge", label: "Grio Chat", icon: Bot },
      ],
    },
  ];

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header>
          <h1 className="bt-display text-[1.75rem] leading-tight sm:text-[2.1rem]">
            {t("userPage.me.title", "Me & Trust")}
          </h1>
          <p className="mt-1 text-base text-muted">
            {t("userPage.me.subtitle", "Aapki profile, bharosa aur privacy — sab ek jagah.")}
          </p>
          <div className="bt-rule bt-rule--left mt-3" aria-hidden>
            <RuleMotif />
          </div>
        </header>

        {/* Not live yet → the one thing that unblocks everything, as a thin
            line above the rows, not a competing hero. */}
        {!isLive && (
          <Link href="/profile/build" className="bt-card bt-card--link group flex items-center gap-3.5 px-4 py-3">
            <span className="bt-ring bt-ring--blush [--paper-ring-size:2.5rem]">
              <UserIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[0.875rem] font-semibold text-ink">
                  {t("userPage.me.resumeProfile", "Profile poori karein")}
                </span>
                <span className="bt-numeral shrink-0 text-[0.9375rem]">
                  {view.readiness.done}/{view.readiness.total}
                </span>
              </span>
              <span className="bt-bar bt-bar--thin mt-2">
                <span
                  className="bt-bar__fill"
                  style={{
                    width: `${view.readiness.total === 0 ? 0 : Math.round((view.readiness.done / view.readiness.total) * 100)}%`,
                  }}
                />
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-1" />
          </Link>
        )}

        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`me-${group.id}`}>
            <h2 id={`me-${group.id}`} className="bt-section-label mb-2.5">
              <Sparkle />
              {group.title}
            </h2>
            <div className="bt-card overflow-hidden">
              <ul className="bt-rows">
                {group.rows.map((row) => (
                  <li key={row.href}>
                    <StatusRow row={row} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}

        {/* The richer cards, kept whole, behind one tap. */}
        {data && (
          <details className="group">
            <summary className="bt-rule bt-disclosure flex items-center">
              <span className="bt-eyebrow bt-eyebrow--caps">
                {t("userPage.me.details", "Details")}
                <ChevronDown className="size-3.5" />
              </span>
            </summary>
            <div className="mt-5 flex flex-col gap-5">
              <TrustScoreCard
                score={data.trust.score}
                scoreLabel={data.trust.label}
                positiveFactors={data.trust.positiveFactors}
                improvementFactors={data.trust.improvementFactors}
              />
              <ProfileIntelligenceCard
                intelligence={data.profileIntelligence}
                completionPercentage={data.profile.completionPercentage}
                missingFields={data.profile.missingFields}
              />
              <AINextStepCard data={data.aiNextStep} />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <DemandMeterCard demand={data.demand} />
                <ProfileActivityCard activity={data.activity} />
              </div>
              <SubscriptionStatusCard
                currentPlan={data.subscription.currentPlan}
                status={data.subscription.status}
                source={data.subscription.source}
                grantedUntil={data.subscription.grantedUntil}
                cta={data.subscription.cta}
              />
            </div>
          </details>
        )}
      </div>
    </UserShell>
  );
}

/**
 * A status with a verdict in it ("75/100", "Standard", "Abhi live nahi")
 * is a chip; a status that is only a hint ("PIN lock, install") is a
 * caption. Same rule as the dashboard: a chip is a word, not a sentence.
 */
const STATUS_CHIP: Record<Exclude<NonNullable<Row["tone"]>, "muted">, string> = {
  trust: "bt-chip bt-chip--trust",
  warn: "bt-chip bt-chip--warn",
};

function StatusRow({ row }: { row: Row }) {
  const Icon = row.icon;
  const tone = row.tone ?? "muted";
  return (
    <Link href={row.href} className="bt-row group min-h-14">
      <span className="bt-ring [--paper-ring-size:2.5rem]">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-[0.9375rem] font-medium text-ink">{row.label}</span>
      {row.status &&
        (tone === "muted" ? (
          <span className="max-w-[45%] shrink-0 truncate text-[0.8125rem] text-subtle">{row.status}</span>
        ) : (
          <span className={cn("shrink-0", STATUS_CHIP[tone])}>{row.status}</span>
        ))}
      <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-1 group-hover:text-primary-text" />
    </Link>
  );
}

