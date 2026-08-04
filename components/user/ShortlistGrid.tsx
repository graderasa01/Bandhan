"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Heart, Lock, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import KundliNoteList from "@/components/profile/KundliNoteList";
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
                  other person, so it can never unlock their photo. */}
              {e.photoUnlocked && e.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known
                <img src={e.photoUrl} alt={e.displayName} className="size-full object-cover" />
              ) : (
                <span className="absolute inset-0 grid place-items-center">
                  <Lock className="size-5 text-muted" />
                </span>
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
                    Interest bhejein
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
