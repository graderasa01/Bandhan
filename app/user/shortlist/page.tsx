import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getShortlist } from "@/lib/data/shortlistData";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import ShortlistGrid from "@/components/user/ShortlistGrid";
import EmptyState from "@/components/states/EmptyState";

export default async function ShortlistPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/shortlist");
  const t = await getT();

  const entries = await getShortlist(user.id);

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-accent-text">
            {t("userPages.shortlist.title", "Meri Shortlist")}
          </h1>
          <p className="mt-1.5 text-base text-muted">
            {t(
              "userPages.shortlist.subtitle",
              "Reel me neeche swipe kiye hue rishtey yahan save rehte hain. Inhe koi aur nahi dekh sakta.",
            )}
          </p>
        </section>

        {entries.length === 0 ? (
          <EmptyState
            title={t("userPages.shortlist.emptyTitle", "Abhi shortlist khaali hai.")}
            description={t(
              "userPages.shortlist.emptyDescription",
              "Rishta Reel me kisi profile par neeche swipe karein — wo yahan save ho jayegi, taaki aap ghar walon se baat karke baad me faisla kar sakein.",
            )}
          />
        ) : (
          <ShortlistGrid entries={entries} />
        )}
      </div>
    </UserShell>
  );
}
