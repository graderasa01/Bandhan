import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getMatchesData } from "@/lib/data/discoveryData";
import UserShell from "@/components/layout/UserShell";
import MatchCard from "@/components/match/MatchCard";
import EmptyState from "@/components/states/EmptyState";
import Card from "@/components/ui/Card";

export default async function MatchesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/matches");

  const data = await getMatchesData(user.id);
  const { matches } = data;

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-accent-text">Matches</h1>
          <p className="mt-2 text-sm text-muted">
            {matches.length} profiles match huye hain — verified profiles with trust scores.
          </p>
        </section>

        {matches.length === 0 ? (
          <EmptyState
            title="Abhi koi match nahi mila."
            description="Profile complete karein aur verified banayein taaki better matches milein."
          />
        ) : (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((m) => (
              <MatchCard
                key={m.id || m.displayName}
                matchId={m.id}
                profileId={m.profileId}
                photoUrl={m.photoUrl}
                name={m.displayName}
                age={m.age}
                city={m.city}
                education={m.education}
                profession={m.profession}
                trustScore={m.trustScore ?? 0}
                verified={m.verified}
                compatibility={m.compatibility}
                matchReason={m.matchReason}
              />
            ))}
          </div>
        )}

        <Card variant="soft" padding="md">
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" />
            Matches trusted profiles se generate hote hain. AI match quality improve karne ke liye deep profile
            complete karein.
          </p>
        </Card>
      </div>
    </UserShell>
  );
}
