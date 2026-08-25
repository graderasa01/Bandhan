import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { safeNextPath } from "@/lib/auth/landingPath";
import UserShell from "@/components/layout/UserShell";
import FocusShell from "@/components/layout/FocusShell";
import Card from "@/components/ui/Card";
import VerifyContactClient from "./VerifyContactClient";

/**
 * A dedicated verification step, not a hard gate: unverified users land here
 * straight after registration (see `app/api/auth/register/route.ts`) but can
 * always skip to `next` — profile building continues either way, and a
 * verification task keeps surfacing in Today Priorities until at least one
 * contact is verified. See `lib/services/today/priorityEngine.ts`.
 *
 * ## Two arrivals, two frames
 *
 * The register route detours brand-new accounts through here on the way to
 * `/profile/build`. That arrival is onboarding, and it was being wrapped in
 * `UserShell` — so a user who did not have a profile yet was handed a sidebar
 * and a bottom nav pointing at Reel, My Rishte and View Profile, every one of
 * which leads to an empty screen. `/profile/build` itself deliberately shares
 * no chrome with `/user/*` for exactly this reason (see the `(onboarding)`
 * route group); the step immediately before it should not either.
 *
 * The other arrival is an established user tapping the verification task in
 * Today Priorities or asking Grio for it. They *do* have somewhere to navigate,
 * and stripping the nav there would strand them on a dead-end page.
 *
 * So the frame follows the arrival: `INCOMPLETE` status plus an explicit
 * `?next=` is the register route's own signature. Both halves matter — status
 * alone would strip the nav from a half-finished account that reached this page
 * through the nav, and `next` alone would strip it from anyone who followed a
 * deep link.
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
  const onboarding = user.status === "INCOMPLETE" && Boolean(params.next);

  const body = (
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
  );

  const frame: ReactNode = onboarding ? (
    <FocusShell>{body}</FocusShell>
  ) : (
    <UserShell userName={user.fullName}>{body}</UserShell>
  );

  return frame;
}
