import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DraftList from "@/components/managed/DraftList";
import { getFamilyDraftEligibility } from "@/lib/services/managedProfile/managedEligibility";
import { listDraftsForCreator } from "@/lib/services/managedProfile/managedDraftService";

export const dynamic = "force-dynamic";

/**
 * A parent preparing a private draft for their adult son or daughter.
 *
 * Deliberately its own space rather than a tab inside `/user/family`: Family
 * Circle is about people who help with *your* profile, and this is the
 * opposite direction — you preparing somebody else's. Folding them together
 * would put two different consent models behind one heading.
 */
export default async function FamilyDraftsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/managed-drafts");

  const eligibility = await getFamilyDraftEligibility(user);
  if (!eligibility.ok) {
    return (
      <UserShell userName={user.fullName}>
        <div className="mx-auto max-w-md">
          <Card variant="warning" padding="lg" className="text-center">
            <ShieldAlert className="mx-auto size-10 text-warn" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold text-ink">Ek step baaki hai</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{eligibility.message}</p>
            {eligibility.ctaHref && (
              <div className="mt-5">
                <Link href={eligibility.ctaHref}>
                  <Button>Continue</Button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      </UserShell>
    );
  }

  const drafts = await listDraftsForCreator(user.id);

  return (
    <UserShell userName={user.fullName}>
      <DraftList
        drafts={drafts}
        newHref="/user/managed-drafts/new"
        detailHrefPrefix="/user/managed-drafts"
        title="Family Drafts"
        ctaLabel="New Draft"
        emptyBody="Bete ya beti ki profile ki details aap yahan tayyar kar sakte hain. Account unka hi rahega — aap link bhejenge, wo khud claim karke confirm karenge."
      />
    </UserShell>
  );
}
