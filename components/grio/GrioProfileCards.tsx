"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Bookmark, BookmarkCheck, Heart, Loader2, Lock, MessageCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import { useGrio } from "./GrioProvider";
import { runGrioAction } from "./runGrioAction";
import { photoLockLine } from "@/lib/contracts/photoLock";
import type { GrioCardsResponse, GrioProfileCard } from "@/lib/contracts/grioCards";

/**
 * People, shown inside Grio's chat — the reel's faces without leaving the
 * conversation.
 *
 * ## Who decides what is on screen
 *
 * The ids arrive from code: a roster ordinal the server resolved, a focus hop,
 * or a Discovery search. This component fetches the cards itself from
 * `/api/grio/cards`, which re-checks every id — so what renders here is never
 * more than the profile page would show this viewer, and none of it is ever in
 * a prompt. Grio points; this shows.
 *
 * ## Every button is a door that already exists
 *
 * Interest posts through `runGrioAction` (the same catalog row and endpoint the
 * chat's own chips use), Shortlist is the shortlist endpoint, Message and View
 * are links. A tap on a card is the user choosing the person with their own
 * finger — the Phase H rule — so nothing here needs the picker.
 *
 * Interest takes two taps: the first turns the button into "Confirm", because
 * it is seen by the other person, spends a monthly slot and is only withdrawable
 * for a day. The same promise the chip's confirm sheet makes, in less space.
 */
export default function GrioProfileCards({
  profileIds,
  onOutcome,
  onAskAbout,
}: {
  profileIds: string[];
  /** Code's sentence for the transcript after an action — see `appendOutcome`. */
  onOutcome: (line: string) => void;
  /** Focus Grio on this person, the same as saying their name. */
  onAskAbout: (card: GrioProfileCard) => void;
}) {
  const t = useT();
  const [cards, setCards] = useState<GrioProfileCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const key = profileIds.join(",");

  useEffect(() => {
    let cancelled = false;
    setCards(null);
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch("/api/grio/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileIds }),
        });
        const json = (await res.json()) as GrioCardsResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setFailed(true);
          return;
        }
        setCards(json.cards ?? []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `key` stands in for the array, whose identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (failed) {
    return <p className="text-[0.75rem] text-muted">{t("grio.cards.failed", "Profiles load nahi ho payin.")}</p>;
  }

  if (cards === null) {
    return (
      <div className="flex w-full gap-2.5 overflow-hidden" aria-busy>
        {profileIds.slice(0, 3).map((id) => (
          <div key={id} className="h-64 w-44 shrink-0 animate-pulse rounded-lg border border-line bg-bg-subtle" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <p className="text-[0.75rem] text-muted">
        {t("grio.cards.none", "Ye profiles abhi dikh nahi sakti.")}
      </p>
    );
  }

  return (
    <div
      className="-mx-4 flex w-[calc(100%+2rem)] snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 [&::-webkit-scrollbar]:hidden"
      role="list"
    >
      {cards.map((card) => (
        <PersonCard key={card.profileId} card={card} onOutcome={onOutcome} onAskAbout={onAskAbout} />
      ))}
    </div>
  );
}

function PersonCard({
  card,
  onOutcome,
  onAskAbout,
}: {
  card: GrioProfileCard;
  onOutcome: (line: string) => void;
  onAskAbout: (card: GrioProfileCard) => void;
}) {
  const t = useT();
  const router = useRouter();
  const { close } = useGrio();
  const { toast } = useToast();
  const [shortlisted, setShortlisted] = useState(card.shortlisted);
  const [interestSent, setInterestSent] = useState(card.interestSent);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"interest" | "shortlist" | null>(null);

  const facts = [card.age !== null ? `${card.age}` : null, card.city].filter(Boolean).join(" · ");
  const lockLine = photoLockLine(card.photoLock, t);

  function go(href: string) {
    haptic("tap");
    close();
    router.push(href);
  }

  async function sendInterest() {
    if (busy) return;
    if (!confirming) {
      haptic("tap");
      setConfirming(true);
      return;
    }
    setBusy("interest");
    const result = await runGrioAction("sendInterestToProfile", card.profileId);
    setBusy(null);
    setConfirming(false);
    if (!result.ok) {
      toast({
        title: t("grio.actionFailed", "Nahi ho paya"),
        description: result.message ?? t("grio.tryAgain", "Dobara try karein."),
        tone: "error",
      });
      return;
    }
    haptic("success");
    setInterestSent(true);
    toast({ title: result.done ?? t("grio.actionDone", "Ho gaya ✓"), tone: "success" });
    // Named, because the transcript line is what the model reads next turn and
    // "interest bhej diya" without a name would leave it guessing to whom.
    if (result.outcome) onOutcome(`${card.name}: ${result.outcome}`);
  }

  async function toggleShortlist() {
    if (busy) return;
    setBusy("shortlist");
    const next = !shortlisted;
    try {
      const res = await fetch(`/api/shortlist/${card.profileId}`, { method: next ? "PUT" : "DELETE" });
      const json = await res.json().catch(() => ({}) as { ok?: boolean; message?: string });
      if (!res.ok || json.ok === false) {
        toast({ title: t("grio.actionFailed", "Nahi ho paya"), description: json.message, tone: "error" });
        return;
      }
      haptic("tap");
      setShortlisted(next);
      if (next) {
        onOutcome(
          `✓ ${t("grio.cards.shortlistedOutcome", "{name} ko shortlist me save kar liya — unhe iski koi khabar nahi jaati.").replace("{name}", card.name)}`,
        );
      }
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      role="listitem"
      aria-label={card.name}
      className="flex w-44 shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm"
    >
      <button
        type="button"
        onClick={() => go(`/user/profile/${card.profileId}`)}
        className="relative block aspect-[4/5] w-full bg-bg-subtle text-left"
        aria-label={t("grio.cards.openProfileAria", "{name} ki profile kholein").replace("{name}", card.name)}
      >
        {card.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.photoUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : (
          <span className="absolute inset-0 grid place-items-center">
            <span className="flex flex-col items-center gap-1.5 px-3 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-gold-100 text-lg font-semibold text-gold-700 dark:bg-gold-900/40 dark:text-gold-300">
                {card.name.slice(0, 1).toUpperCase()}
              </span>
              {lockLine && (
                <span className="flex items-center gap-1 text-[0.6875rem] leading-tight text-muted">
                  <Lock className="size-3 shrink-0" aria-hidden />
                  {lockLine}
                </span>
              )}
            </span>
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-8">
          <span className="flex items-center gap-1 text-[0.875rem] font-semibold text-white">
            <span className="truncate">{card.name}</span>
            {card.verified && <BadgeCheck className="size-3.5 shrink-0 text-gold-200" aria-label="Verified" />}
          </span>
          {facts && <span className="block truncate text-[0.6875rem] text-white/85">{facts}</span>}
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-1.5 p-2">
        {card.profession && <p className="truncate text-[0.6875rem] text-muted">{card.profession}</p>}

        {card.matchId ? (
          <button
            type="button"
            onClick={() => go(`/user/messages/${card.matchId}`)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-[0.75rem] font-medium text-primary-fg"
          >
            <MessageCircle className="size-3.5" aria-hidden />
            {card.chatOpen ? "Message" : "Open Chat"}
          </button>
        ) : (
          <button
            type="button"
            disabled={interestSent || busy !== null}
            onClick={sendInterest}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-[0.75rem] font-medium transition-colors",
              interestSent
                ? "border border-line text-muted"
                : confirming
                  ? "bg-accent text-accent-fg"
                  : "bg-primary text-primary-fg",
            )}
          >
            {busy === "interest" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Heart className={cn("size-3.5", interestSent && "fill-current")} aria-hidden />
            )}
            {interestSent ? "Interest Sent" : confirming ? "Confirm Interest" : "Send Interest"}
          </button>
        )}
        {confirming && !interestSent && (
          <p className="text-[0.625rem] leading-snug text-muted">
            {t("grio.cards.interestConfirmHint", "Unhe dikhega, mahine ka ek interest lagega; 24 ghante me wapas le sakte hain.")}
          </p>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={toggleShortlist}
            aria-pressed={shortlisted}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-line text-[0.6875rem] text-ink transition-colors hover:border-gold-400"
          >
            {shortlisted ? <BookmarkCheck className="size-3.5 text-gold-700" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
            {shortlisted ? "Saved" : "Shortlist"}
          </button>
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              onAskAbout(card);
            }}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-line text-[0.6875rem] text-ink transition-colors hover:border-gold-400"
          >
            <Sparkles className="size-3.5 text-gold-700" aria-hidden />
            Ask Grio
          </button>
        </div>
      </div>
    </article>
  );
}
