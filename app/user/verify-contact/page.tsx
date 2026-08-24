import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { safeNextPath } from "@/lib/auth/landingPath";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import VerifyContactClient from "./VerifyContactClient";

/**
 * A dedicated verification step, not a hard gate: unverified users land here
 * straight after registration (see `app/api/auth/register/route.ts`) but can
 * always skip to `next` — profile building continues either way, and a
 * verification task keeps surfacing in Today Priorities until at least one
 * contact is verified. See `lib/services/today/priorityEngine.ts`.
 */
export default async function VerifyContactPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/verify-contact");

  const t = await getT();
  const params = searchParams ? await searchParams : {};
  const next = safeNextPath(params.next) ?? "/profile/build";

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-lg space-y-4">
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700">
            {t("verifyContact.title", "Contact Verify Karein")}
          </h1>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            {t(
              "verifyContact.subtitle",
              "Mobile aur email verify karne se Trust Score badhta hai aur profile zyada real dikhti hai. Aap chahein to abhi skip bhi kar sakte hain.",
            )}
          </p>
        </header>

        <Card variant="default" padding="lg">
          <VerifyContactClient next={next} />
        </Card>
      </div>
    </UserShell>
  );
}
