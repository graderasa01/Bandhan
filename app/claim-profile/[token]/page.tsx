import Link from "next/link";
import { LinkIcon } from "lucide-react";
import FocusShell from "@/components/layout/FocusShell";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ClaimProfileClient from "@/components/managed/ClaimProfileClient";
import { getCurrentUser } from "@/lib/auth/session";
import { getClaimPreview, isClaimTokenCreator } from "@/lib/services/managedProfile/claimTokenService";

export const dynamic = "force-dynamic";

/**
 * The claim link's landing page.
 *
 * Public by construction: it sits outside middleware's matcher
 * (`/user`, `/partner`, `/admin`, `/profile`), because the person opening it
 * very often has no account yet. What makes that safe is `getClaimPreview`,
 * which returns a creator type, a label and two counts — never a field value.
 *
 * `FocusShell` rather than `UserShell`: this is one decision on one screen, and
 * a sidebar full of links into an app the visitor may not have joined yet
 * would be both useless and confusing.
 */
export default async function ClaimProfilePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [result, user] = await Promise.all([getClaimPreview(token), getCurrentUser()]);

  if (!result.ok) {
    return (
      <FocusShell>
        <div className="mx-auto w-full max-w-md">
          <Card variant="warning" padding="lg" className="text-center">
            <LinkIcon className="mx-auto size-10 text-warn" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold text-ink">Ye link ab kaam nahi karta</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{result.message}</p>
            <div className="mt-5">
              <Link href="/">
                <Button variant="secondary">Go Home</Button>
              </Link>
            </div>
          </Card>
        </div>
      </FocusShell>
    );
  }

  // Who is looking, resolved server-side. The client component only renders
  // what this decides — it never derives eligibility itself, and the API
  // re-checks all of it on the actual claim anyway.
  let viewer: Parameters<typeof ClaimProfileClient>[0]["viewer"] = { state: "anonymous" };
  if (user) {
    if (await isClaimTokenCreator(token, user.id)) {
      viewer = { state: "creator" };
    } else if (user.role !== "USER") {
      viewer = { state: "wrong_role" };
    } else if (!user.mobileVerifiedAt && !user.emailVerifiedAt) {
      viewer = { state: "unverified", name: user.fullName };
    } else {
      viewer = { state: "ready", name: user.fullName };
    }
  }

  return (
    <FocusShell>
      <ClaimProfileClient token={token} preview={result.preview} viewer={viewer} />
    </FocusShell>
  );
}
