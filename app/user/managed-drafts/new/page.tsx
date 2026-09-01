import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import NewDraftForm from "@/components/managed/NewDraftForm";
import { getFamilyDraftEligibility } from "@/lib/services/managedProfile/managedEligibility";

export const dynamic = "force-dynamic";

export default async function NewFamilyDraftPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/managed-drafts/new");

  const eligibility = await getFamilyDraftEligibility(user);
  if (!eligibility.ok) redirect("/user/managed-drafts");

  return (
    <UserShell userName={user.fullName}>
      <NewDraftForm
        backHref="/user/managed-drafts"
        detailHrefPrefix="/user/managed-drafts"
        subjectWord="ghar wale ka"
      />
    </UserShell>
  );
}
