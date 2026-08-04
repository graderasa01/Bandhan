"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Heart,
  HelpCircle,
  Loader2,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import ReelAISheet from "@/components/reel/ReelAISheet";
import ShareRishtaCardSheet from "@/components/profile/ShareRishtaCardSheet";
import AskQuestionSheet from "@/components/askBridge/AskQuestionSheet";
import { useToast } from "@/components/ui/Toast";
import { popIn, slideUpSheet, haptic } from "@/lib/motion";
import type { ProfileViewModel } from "@/lib/contracts/profileView";

/**
 * Collapsed by default — a small floating action button above the bottom nav,
 * not a bar that eats screen space on every scroll position. Tapping it (or
 * tapping anywhere else on the page that isn't already its own link/button)
 * slides the real action bar up from the bottom; tapping the chevron puts it
 * away. Devesh's call after the always-open bar felt "awkward" taking up
 * permanent room on a page that's otherwise just profile reading.
 *
 * "AI se poochiye" reuses the reel's sheet unchanged. Until now that sheet was
 * only reachable from an UP swipe, and the reel never re-shows a swiped card —
 * so the moment a user had the most reason to ask a question (they are staring
 * at the full profile) was exactly the moment the feature disappeared.
 */
export default function ProfileActionBar({ profile }: { profile: ProfileViewModel }) {
  const router = useRouter();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<"interest" | "shortlist" | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [askQuestionOpen, setAskQuestionOpen] = useState(false);
  const [asked, setAsked] = useState(profile.askedStatus !== "NONE");
  const panelRef = useRef<HTMLDivElement>(null);

  // A tap anywhere on the page (not on an existing link/button — those keep
  // their own job) also opens the panel, same as tapping the FAB. Only wired
  // up while collapsed — once open, this listener comes off entirely, so it
  // never fights with clicking something inside the now-open panel or
  // elsewhere on the page.
  useEffect(() => {
    if (expanded) return;
    function onScreenTap(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, input, textarea, select, [role='button']")) return;
      haptic("tap");
      setExpanded(true);
    }
    document.addEventListener("click", onScreenTap);
    return () => document.removeEventListener("click", onScreenTap);
  }, [expanded]);

  // The other direction: once open, any click outside the panel closes it
  // back to the ball — the chevron is still there too, this is just the
  // faster path. Clicks inside the panel (Shortlist, AI se poochiye, etc.)
  // are excluded via `panelRef` so they keep doing their own thing instead of
  // also closing the panel out from under them.
  useEffect(() => {
    if (!expanded) return;
    function onOutsideClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setExpanded(false);
    }
    document.addEventListener("click", onOutsideClick);
    return () => document.removeEventListener("click", onOutsideClick);
  }, [expanded]);

  async function sendInterest() {
    setBusy("interest");
    try {
      const res = await fetch("/api/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.profileId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Interest nahi bheja ja saka", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: json.matched ? "Match ho gaya! 🎉" : "Interest bhej diya",
        description: json.matched
          ? "Poori profile khul gayi hai — ab aap dono baat kar sakte hain."
          : "Unke jawab ka intezaar karein.",
        tone: "success",
      });
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function toggleShortlist() {
    setBusy("shortlist");
    const method = profile.shortlisted ? "DELETE" : "PUT";
    try {
      const res = await fetch(`/api/shortlist/${profile.profileId}`, { method });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Action fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: profile.shortlisted ? "Shortlist se hata diya" : "Shortlist me save kar liya",
        tone: "success",
      });
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  if (profile.isSelf) return null;

  const primaryLabel = profile.matchId ? "Message karein" : profile.interestSent ? "Actions" : "Interest bhejein";
  const PrimaryIcon = profile.matchId ? MessageCircle : profile.interestSent ? Sparkles : Heart;

  return (
    <>
      {/* Collapsed state — a floating ball in the top-right corner, just under
          the header, so the page reads as "reading a profile" until there's
          something to decide. NOTE: no `.touch-target` here — that utility
          sets `position: relative` (globals.css) which was silently winning
          the cascade over `fixed` and stranding this button in normal flow at
          the bottom of the page; the button is already 56px, well past the
          48px minimum, so the hit-area trick isn't needed anyway. */}
      <AnimatePresence>
        {!expanded && (
          <motion.button
            type="button"
            key="fab"
            variants={popIn}
            initial="hidden"
            animate="show"
            exit="hidden"
            onClick={() => {
              haptic("tap");
              setExpanded(true);
            }}
            className="fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px))] right-4 z-20 flex flex-col items-end gap-1.5 md:bottom-6"
          >
            <span className="rounded-full border border-line bg-surface/95 px-2.5 py-1 text-[0.6875rem] font-medium text-muted shadow-sm backdrop-blur-sm">
              {primaryLabel}
            </span>
            <span className="grid size-14 place-items-center rounded-full bg-wine-700 text-white shadow-lg">
              <PrimaryIcon className="size-6" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* AppShell's mobile bottom nav is `fixed bottom-0 z-40 h-[60px]`, so a
          bar stuck to bottom-0 lands underneath it — visible, and completely
          unclickable. Sit above the nav on phones, at the edge from md up
          where the nav is `md:hidden`. */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="bar"
            ref={panelRef}
            variants={slideUpSheet}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom,0px))] z-20 mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-6 sm:rounded-lg sm:border md:bottom-6 md:mx-auto md:max-w-2xl"
          >
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Band karein"
              className="mx-auto -mt-1 mb-1 flex h-6 w-full touch-target items-center justify-center text-muted"
            >
              <ChevronDown className="size-4" />
            </button>

            {/* One prominent action — the reason this bar exists — plus a compact
                icon row for everything else, instead of four equal-weight pills
                that wrap to three stacked rows on a phone. */}
            {profile.matchId ? (
              <Link href={`/user/messages/${profile.matchId}`} className="block">
                <Button variant="primary" icon={<MessageCircle className="size-4" />} fullWidth>
                  Message karein
                </Button>
              </Link>
            ) : profile.interestSent ? (
              <Pill tone="gold" size="md">
                Interest bhej chuke hain
              </Pill>
            ) : (
              <Button
                variant="accent"
                icon={<Heart className="size-4" />}
                loading={busy === "interest"}
                disabled={busy !== null}
                onClick={sendInterest}
                fullWidth
              >
                Interest bhejein
              </Button>
            )}

            <div className="mt-3 flex items-center justify-around border-t border-line pt-3">
              <IconAction
                icon={profile.shortlisted ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                label={profile.shortlisted ? "Saved" : "Shortlist"}
                loading={busy === "shortlist"}
                disabled={busy !== null}
                onClick={toggleShortlist}
              />

              <IconAction icon={<Sparkles className="size-4" />} label="AI se poochiye" onClick={() => setAskOpen(true)} />

              {/* Phase D — a typed question the person themself answers in voice,
                  distinct from "AI se poochiye" above (which asks the AI, not
                  them). Hidden once already asked — ProfileQuestion's unique
                  index caps it at one per candidate, ever. */}
              {profile.askBridgeEnabled && !asked && (
                <IconAction icon={<HelpCircle className="size-4" />} label="Kuch Poochein" onClick={() => setAskQuestionOpen(true)} />
              )}

              {/* Only at L3 — a Rishta Card is this profile's L3 field-set, so
                  sharing it before a Match exists would hand out more than the
                  candidate ever agreed to. */}
              {profile.matchId && (
                <IconAction icon={<Users className="size-4" />} label="Family ko bhejein" onClick={() => setShareOpen(true)} />
              )}
            </div>

            {profile.interestReceived && !profile.matchId && (
              <p className="mt-2 text-[0.8125rem] text-muted">
                {profile.displayName} ne aapko interest bheja hai — Interests page se accept kar sakte hain.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ReelAISheet
        open={askOpen}
        onClose={() => setAskOpen(false)}
        profileId={profile.profileId}
        displayName={profile.displayName}
      />

      <AskQuestionSheet
        open={askQuestionOpen}
        onClose={() => setAskQuestionOpen(false)}
        profileId={profile.profileId}
        displayName={profile.displayName}
        onAsked={() => setAsked(true)}
      />

      {profile.matchId && (
        <ShareRishtaCardSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          profileId={profile.profileId}
          displayName={profile.displayName}
        />
      )}
    </>
  );
}

/** A secondary action in the compact row below the one prominent button — icon + tiny label, not a full pill. */
function IconAction({
  icon,
  label,
  onClick,
  loading,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 min-w-12 touch-target flex-col items-center gap-1 disabled:pointer-events-none disabled:opacity-45"
    >
      <span className="grid size-10 place-items-center rounded-full border border-line-strong bg-surface text-ink transition-colors">
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      </span>
      <span className="whitespace-nowrap text-[0.6875rem] font-medium text-muted">{label}</span>
    </button>
  );
}
