"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Heart, Lock, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import KundliNoteList from "@/components/profile/KundliNoteList";
import PhotoUnlockCta from "@/components/subscription/PhotoUnlockCta";
import { useToast } from "@/components/ui/Toast";
import type { ShortlistEntry } from "@/lib/data/shortlistData";

export default function ShortlistGrid({ entries }: { entries: ShortlistEntry[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(profileId: string, method: "POST" | "DELETE") {
    setBusyId(profileId);
    try {
      const res = await fetch(`/api/shortlist/${profileId}`, { method });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Action fail hua", description: json.message, tone: "error" });
        return;
      }
      if (method === "DELETE") {
        toast({ title: "Shortlist se hata diya", tone: "success" });
      } else {
        toast({
          title: json.matched ? "Match ho gaya! 🎉" : "Interest bhej diya",
          description: json.matched ? "Ab aap dono baat kar sakte hain." : "Unke jawab ka intezaar karein.",
          tone: "success",
        });
      }
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {entries.map((e) => (
        <Card key={e.profileId} variant="default" padding="md">
          <div className="flex gap-3">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-wine-100 via-gold-100 to-sand-200 dark:from-wine-900 dark:via-gold-900 dark:to-sand-800">
              {/* Same consent gate as the reel — shortlisting is invisible to the
                  other person, so it can never unlock their photo.

                  The locked state used to be a bare padlock on an empty square,
                  which reads as "this row is broken" rather than "this photo is
                  withheld" — a whole shortlist of them looked like a page that
                  had failed to load. It now shows the initial (so each card is
                  visually distinct at a glance) with the padlock as a corner
                  chip, and the reason is spelled out under the name. */}
              {e.photoUnlocked && e.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known
                <img src={e.photoUrl} alt={e.displayName} className="size-full object-cover" />
              ) : (
                <>
                  <span
                    aria-hidden
                    className="absolute inset-0 grid place-items-center font-[family-name:var(--font-display)] text-3xl font-bold text-wine-700/50 dark:text-gold-100/40"
                  >
                    {e.displayName.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-surface/85 backdrop-blur-sm">
                    <Lock className="size-3 text-muted" />
                  </span>
                </>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link
                  href={`/user/profile/${e.profileId}`}
                  className="truncate font-semibold text-ink transition-colors hover:text-primary-text"
                >
                  {e.displayName}
                  {e.age ? `, ${e.age}` : ""}
                </Link>
                {e.photoVerified && <BadgeCheck className="size-4 shrink-0 text-trust" />}
                {e.trustScore != null && (
                  <Pill tone="trust" size="sm">
                    {e.trustScore}
                  </Pill>
                )}
              </div>
              <p className="mt-0.5 truncate text-[0.8125rem] text-muted">
                {[e.city, e.education].filter(Boolean).join(" · ") || "Details nahi bhari"}
              </p>
              {e.profession && <p className="truncate text-[0.8125rem] text-muted">{e.profession}</p>}
              {/* Says the same thing the reel's locked card says, in the same
                  words. Deliberately shown whether or not this person actually
                  has a photo on file: a line that appeared only for people who
                  do would quietly leak that fact about everyone else. */}
              {!e.photoUnlocked && (
                <>
                  <p className="mt-1 flex items-center gap-1 text-[0.6875rem] text-subtle">
                    <Lock className="size-3 shrink-0" aria-hidden />
                    Photo mutual interest ya subscription ke baad dikhegi
                  </p>
                  {/* Its own line, not tucked inside the caption above: inline
                      inside that 11px text the link came out 18px tall, which
                      is not a thumb target. `min-h-9` rather than the default
                      44 because this card is dense and four of them stacked
                      would push the actions off a phone screen. */}
                  <PhotoUnlockCta className="min-h-9 text-[0.75rem]" />
                </>
              )}
              <p className="mt-0.5 text-[0.6875rem] text-subtle">{e.shortlistedOn} ko save kiya</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {e.interestSent ? (
                  <Pill tone="gold" size="sm">
                    Interest bhej chuke hain
                  </Pill>
                ) : (
                  <Button
                    size="sm"
                    variant="accent"
                    icon={<Heart className="size-4" />}
                    loading={busyId === e.profileId}
                    onClick={() => act(e.profileId, "POST")}
                  >
                    Send Interest
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="size-4" />}
                  disabled={busyId === e.profileId}
                  onClick={() => act(e.profileId, "DELETE")}
                >
                  Hataayein
                </Button>
              </div>
            </div>
          </div>

          <KundliNoteList notes={e.kundliNotes} />
        </Card>
      ))}
    </div>
  );
}
