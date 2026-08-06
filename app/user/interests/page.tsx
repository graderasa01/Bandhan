import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getInterestsData } from "@/lib/data/discoveryData";
import UserShell from "@/components/layout/UserShell";
import InterestsTabs from "@/components/interests/InterestsTabs";
import Card from "@/components/ui/Card";

export default async function InterestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/interests");

  const data = await getInterestsData(user.id);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-3xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-accent-text">Interests</h1>
          <p className="mt-2 text-sm text-muted">Received aur sent interests ka overview.</p>
        </section>

        <InterestsTabs
          received={data.received}
          sent={data.sent}
          emptyReceived={data.emptyReceived}
          emptySent={data.emptySent}
        />

        <Card variant="soft" padding="md">
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" />
            Sirf verified profiles se interests accept karein. Personal details chat me share na karein.
          </p>
        </Card>
      </div>
    </UserShell>
  );
}
