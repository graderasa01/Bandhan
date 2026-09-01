import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listRishtey } from "@/lib/services/rishta/rishtaListService";
import UserShell from "@/components/layout/UserShell";
import RishtaCard from "@/components/rishta/RishtaCard";
import EmptyState from "@/components/states/EmptyState";
import Card from "@/components/ui/Card";

/**
 * My Rishte — every rishta, and whose move each one is.
 *
 * ## What this page used to be
 *
 * A grid of `MatchCard`s: photo, age, city, trust score, two buttons. It showed
 * only `Match` rows, so an interest sent yesterday and a conversation that has
 * reached a family meeting were either absent or identical. Nothing on the
 * screen said what stage anything was at, and nothing said what to do — the
 * rishta journey existed in full underneath (stages, topics, meetings, notes)
 * and surfaced nowhere except inside one chat thread.
 *
 * So the grid is gone. This is the same data asked a different question: not
 * "who matched with me" but **"kis rishtey mein ab mera kadam baaki hai."**
 *
 * ## Why three sections and not ten
 *
 * There are ten stages, and heading the page with ten of them would hand the
 * sorting back to the user. `bucketOf` collapses them into the only split that
 * changes what somebody does when they open this page: yours to move, theirs to
 * move, already finished. The stage still shows — on the card, where it is a
 * fact about one rishta rather than a filing system.
 *
 * The URL is unchanged. `/user/matches` is what the nav, the dashboard and
 * every existing link point at, and moving it would have bought a nicer path at
 * the cost of every one of them.
 */
export default async function MyRishtePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/matches");

  const board = await listRishtey(user.id);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">My Rishte</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {board.total === 0
              ? "Yahan har wo rishta aayega jo shuru ho chuka hai — aur har ek ke saamne likha hoga ki agla kadam kiska hai."
              : board.needsYou > 0
                ? `${board.total} rishte hain. ${board.needsYou} mein agla kadam aapka hai.`
                : `${board.total} rishte hain. Abhi kisi mein aapka kuch baaki nahi hai.`}
          </p>
        </section>

        {board.total === 0 ? (
          <EmptyState
            title="Abhi koi rishta shuru nahi hua."
            description="Reel par swipe kijiye ya kisi ko interest bhejiye — jaise hi kuch shuru hoga, wo yahan apne stage ke saath dikhega."
            primaryAction={{ label: "Open Reel", href: "/user/reel" }}
          />
        ) : (
          <div className="flex flex-col gap-7">
            {board.buckets.map((b) => (
              <section key={b.bucket}>
                <div className="mb-2.5">
                  <h2 className="text-sm font-semibold text-ink">
                    {b.label}
                    <span className="ml-1.5 font-normal text-muted">{b.entries.length}</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">{b.note}</p>
                </div>
                <div className="flex flex-col gap-3">
                  {b.entries.map((e) => (
                    <RishtaCard key={e.otherUserId} entry={e} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <Card variant="soft" padding="md" className="mt-7">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" />
            Har rishtey ka stage sirf aapka hai. Aapne kya mark kiya, kya likha — wo saamne wale ko kabhi
            nahi dikhta, aur unka apna stage aapko nahi dikhta.
          </p>
        </Card>
      </div>
    </UserShell>
  );
}
