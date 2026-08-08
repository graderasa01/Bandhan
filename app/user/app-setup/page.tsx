import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import UserShell from "@/components/layout/UserShell";
import AppInstallPanel from "@/components/pwa/AppInstallPanel";
import PinSettingsCard from "@/components/auth/PinSettingsCard";
import Button from "@/components/ui/Button";

/**
 * The dedicated, nav-listed home for "log in once, never again" — the two
 * pieces (`AppInstallPanel`, `PinSettingsCard`) already live inline on the
 * dashboard, but only there. This page exists so someone who skips them on
 * day one — or wants to turn the PIN off later — has somewhere findable to
 * come back to, rather than the feature only existing as a card they have to
 * remember scrolling past.
 */
export default async function AppSetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/app-setup");

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <section className="mb-6">
          <h1 className="mb-1 text-2xl font-bold text-wine-700">App Setup</h1>
          <p className="mb-4 text-[0.8125rem] leading-snug text-muted">
            Ek baar set kar lijiye — uske baad sirf icon tap aur 4-digit PIN, na URL type karna,
            na baar-baar login.
          </p>

          <div className="flex flex-col gap-4">
            <AppInstallPanel />
            <PinSettingsCard initialHasPin={Boolean(user.pinHash)} />
          </div>
        </section>

        <section className="flex flex-wrap justify-center gap-4 py-4">
          <Link href="/user/dashboard">
            <Button variant="ghost">Back to Dashboard</Button>
          </Link>
        </section>
      </div>
    </UserShell>
  );
}
