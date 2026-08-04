import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveShareLink } from "@/lib/services/share/shareLinkService";
import { buildBiodata } from "@/lib/services/biodata/biodataExport";
import { ageFromDate } from "@/lib/services/match/age";
import SharedProfileView from "@/components/share/SharedProfileView";
import SharedSochBoardView from "@/components/share/SharedSochBoardView";
import ShareLinkInactiveCard from "@/components/share/ShareLinkInactiveCard";

export const runtime = "nodejs";

type Params = { token: string };

/**
 * Wrapped in `cache()` because `resolveShareLink` increments the view
 * counter as a side effect — `generateMetadata` and the page component both
 * need this same data, and without memoizing per-request, Next.js would call
 * it twice and count one real visit as two.
 */
const getView = cache(async (token: string) => {
  const viewer = await getCurrentUser();
  return resolveShareLink(token, viewer?.id);
});

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { token } = await params;
  const view = await getView(token);

  // Never indexed regardless of state — a share link is a private hand-off,
  // not a public listing.
  const robots = { index: false, follow: false };

  if (view.status !== "ok") {
    return { title: "Link active nahi hai", robots };
  }

  if (view.kind === "SOCH_BOARD") {
    return {
      title: `${view.sharerName} ki Soch Board — BandhanTak`,
      description: "Iski soch kaisi hai — poll jawab, apni aawaz me.",
      robots,
    };
  }

  const doc = buildBiodata(view.profile, { includeMobile: false, includeIncome: false, mobile: null });
  const title = view.kind === "RISHTA_CARD" ? `${doc.name} — BandhanTak par match hua` : `${doc.name} ka BandhanTak biodata`;
  const description = doc.tagline ?? "BandhanTak par verified matrimony profile.";

  return {
    title,
    description,
    robots,
    openGraph: {
      title,
      description,
      images: doc.photoUrl ? [{ url: doc.photoUrl }] : undefined,
    },
  };
}

export default async function SharedProfilePage({ params }: { params: Promise<Params> }) {
  const { token } = await params;
  const view = await getView(token);

  if (view.status === "not_found") notFound();
  if (view.status === "inactive") return <ShareLinkInactiveCard reason={view.reason} />;

  if (view.kind === "SOCH_BOARD") {
    return (
      <div className="min-h-dvh bg-bg-subtle">
        <SharedSochBoardView sharerName={view.sharerName} entries={view.sochBoard ?? []} token={token} />
      </div>
    );
  }

  const doc = buildBiodata(view.profile, {
    includeMobile: view.includeMobile,
    includeIncome: view.includeIncome,
    mobile: view.mobile,
  });

  return (
    <div className="min-h-dvh bg-bg-subtle">
      <SharedProfileView
        doc={doc}
        age={ageFromDate(view.profile.dateOfBirth)}
        city={view.profile.currentCity}
        photoVerified={view.profile.photos.some((p) => p.isPrimary && p.verificationStatus === "APPROVED")}
        mobileVerified={Boolean(view.profile.user?.mobileVerifiedAt)}
        trustScore={view.profile.trustScore}
        trustScoreLabel={view.profile.trustScoreLabel}
        watermark={
          view.kind === "RISHTA_CARD"
            ? { sharerName: view.sharerName, sharedOn: view.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) }
            : null
        }
      />
    </div>
  );
}
