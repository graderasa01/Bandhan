"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Gift, HelpCircle, Lock, Mic, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import VoicePlayer from "@/components/voice/VoicePlayer";
import CelebrationHost, { type Celebration } from "@/components/ui/CelebrationHost";
import { useGrio } from "./GrioProvider";
import {
  DECK_CTA,
  deckUnlockLabel,
  formatTimeLeft,
  urgentMsLeft,
  type GrioDeck as GrioDeckData,
  type GrioDeckResponse,
} from "@/lib/contracts/grioDeck";

/**
 * The cards above the conversation — doc 11 §2's "one door", made literal.
 *
 * Everything this component knows arrives from `/api/grio/deck`, which is a
 * server-side read of rows that already exist. It renders what it is handed
 * and nothing more: it does not decide how many cards there are (the builder
 * ranks and rations), it does not write any of the copy that carries a claim
 * (`lib/contracts/grioDeck.ts` does), and it does not know the model exists.
 *
 * ## The one action that happens in place
 *
 * Unlocking a voice note posts to the same `/api/voice-notes/[id]/unlock` the
 * inbox posts to, and that endpoint re-authorizes on its own terms — plan, or
 * a VOICE_UNLOCK credit. This button is a shortcut to an existing door, which
 * is the rule every Grio-proposed action already follows (`GrioActionChips`).
 * Answering a question navigates instead: recording needs the mic sheet the
 * inbox already owns, and a second recorder living in a chat overlay would be
 * a second place for that flow to drift.
 *
 * ## What deliberately isn't here
 *
 * No name before unlock, no transcript preview, no invented countdown. The
 * teaser is the same masked bucket `buildMaskedTeaser` writes for the inbox,
 * and the only clock on screen reads a real `expiresAt` — and only inside the
 * last 48 hours (see `urgentMsLeft`). Someone really did record ten seconds
 * for this person; saying exactly that is the whole pitch.
 */
export default function GrioDeck({ standalone = false }: { standalone?: boolean }) {
  const { isOpen, close } = useGrio();
  const router = useRouter();
  const { toast } = useToast();

  const [deck, setDeck] = useState<GrioDeckData | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** voiceNoteId → playback URL, filled in only by a successful unlock. */
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  const active = standalone || isOpen;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/grio/deck");
      const json = (await res.json()) as GrioDeckResponse;
      // A deck that fails to load leaves the chat exactly as it was before this
      // component existed, so there is nothing to tell the user about.
      setDeck(res.ok && json.ok && json.deck ? json.deck : null);
    } catch {
      setDeck(null);
    }
  }, []);

  // Refetches every time the panel opens rather than once at mount: the whole
  // point of these cards is that they are current, and a user who answered a
  // question on another screen should not reopen Grio to find it still waiting.
  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  function markPlayed(noteId: string) {
    void fetch(`/api/voice-notes/${noteId}/played`, { method: "POST" }).catch(() => {});
  }

  async function unlock(noteId: string) {
    setBusyId(noteId);
    try {
      const res = await fetch(`/api/voice-notes/${noteId}/unlock`, { method: "POST" });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        toast({
          title: "Abhi khul nahi sakti",
          description: json.message,
          tone: "warning",
          action: {
            label: "View Plans",
            onClick: () => {
              close();
              router.push("/user/subscription");
            },
          },
        });
        return;
      }

      setUnlocked((prev) => ({ ...prev, [noteId]: json.playbackUrl as string }));
      if (json.usedCredit) {
        setDeck((d) => (d ? { ...d, unlockCredits: Math.max(0, d.unlockCredits - 1) } : d));
      }
      if (json.celebration) setCelebration(json.celebration as Celebration);
      // The sender's name lives on the screens that own it (inbox, profile) —
      // this response carries a URL, not an identity.
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  function goToInbox() {
    close();
    router.push("/user/inbox");
  }

  function goToReel() {
    close();
    router.push("/user/reel");
  }

  if (!deck || deck.cards.length === 0) return null;

  return (
    <div className="space-y-3">
      {deck.cards.map((card) => {
        if (card.kind === "lockedVoiceNote") {
          const playbackUrl = unlocked[card.id] ?? null;
          return (
            <Card
              key={card.id}
              padding="md"
              variant="soft"
              className="border-gold-300/60 bg-gold-50/50 dark:border-gold-700/30 dark:bg-gold-900/10"
            >
              <p className="flex items-center gap-1.5 text-[0.75rem] font-medium text-muted">
                <Mic className="size-3.5 shrink-0 text-gold-600" />
                {card.isAnswer ? "Aapke sawaal ka jawab aaya hai" : "Aayi hui voice note"}
              </p>

              <p className="mt-1 text-[0.9375rem] font-semibold leading-snug text-ink">
                {card.isAnswer ? (
                  card.teaser
                ) : (
                  <>
                    {card.teaser}
                    <span className="font-normal text-muted"> ne bheji hai</span>
                  </>
                )}
              </p>

              {!playbackUrl && !card.isAnswer && (
                <p className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-muted">
                  <Lock className="size-3 shrink-0 text-gold-600" />
                  Naam aur profile kholne ke baad dikhegi
                </p>
              )}

              <VoicePlayer
                className="mt-3"
                src={playbackUrl}
                seconds={card.seconds}
                locked={!playbackUrl}
                onFirstPlay={() => markPlayed(card.id)}
              />

              {playbackUrl ? (
                <button
                  type="button"
                  onClick={goToInbox}
                  className="mt-3 text-[0.8125rem] font-medium text-gold-700 underline underline-offset-2"
                >
                  Open inbox
                </button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  className="mt-3"
                  disabled={busyId === card.id}
                  loading={busyId === card.id}
                  onClick={() => unlock(card.id)}
                >
                  {deckUnlockLabel(deck.canUnlockFree, deck.unlockCredits)}
                </Button>
              )}
            </Card>
          );
        }

        if (card.kind === "pendingQuestion") {
          const msLeft = urgentMsLeft(card.expiresAt);
          return (
            <Card key={card.id} padding="md" variant="soft">
              <p className="flex items-center gap-1.5 text-[0.75rem] font-medium text-muted">
                <HelpCircle className="size-3.5 shrink-0" />
                {card.teaser} ne poocha hai
              </p>

              <p className="mt-1 text-[0.9375rem] leading-snug text-ink">&ldquo;{card.questionText}&rdquo;</p>

              {/* Only inside the last 48 hours, and only from a real column. */}
              {msLeft !== null && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[0.75rem] font-medium text-wine-700 dark:text-wine-300">
                  <Clock className="size-3.5 shrink-0" />
                  {formatTimeLeft(msLeft)}
                </p>
              )}

              <Button variant="primary" size="md" fullWidth className="mt-3" onClick={goToInbox}>
                {DECK_CTA.pendingQuestion}
              </Button>
            </Card>
          );
        }

        if (card.kind === "expiringCredit") {
          // A benefit reminder, not a sell card (see SELL_CARD_KINDS): nothing
          // is being asked for, so no primary button, just a soft link to
          // where a note might already be waiting.
          const msLeft = urgentMsLeft(card.expiresAt);
          return (
            <Card key={`credit-${card.expiresAt}`} padding="md" variant="soft">
              <p className="flex items-center gap-1.5 text-[0.75rem] font-medium text-muted">
                <Gift className="size-3.5 shrink-0 text-gold-600" />
                Earned reward
              </p>

              <p className="mt-1 text-[0.9375rem] font-semibold leading-snug text-ink">
                Aapke paas {card.count === 1 ? "1 voice-note unlock hai" : `${card.count} voice-note unlocks hain`}
              </p>

              {/* Always non-null here — this card only exists when it is. */}
              {msLeft !== null && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[0.75rem] font-medium text-wine-700 dark:text-wine-300">
                  <Clock className="size-3.5 shrink-0" />
                  {formatTimeLeft(msLeft)} — istemal na hua to khatam ho jayega
                </p>
              )}

              <button
                type="button"
                onClick={goToInbox}
                className="mt-3 text-[0.8125rem] font-medium text-gold-700 underline underline-offset-2"
              >
                {DECK_CTA.expiringCredit}
              </button>
            </Card>
          );
        }

        // dailyMission — `card.headline` is already the complete sentence
        // (Phase G9, see missionService.ts); there is nothing else about this
        // candidate for this component to know or show.
        return (
          <Card
            key={`mission-${card.headline}`}
            padding="md"
            variant="soft"
            className="border-gold-300/60 bg-gold-50/50 dark:border-gold-700/30 dark:bg-gold-900/10"
          >
            <p className="flex items-start gap-2 text-[0.9375rem] font-medium leading-snug text-gold-700">
              <Sparkles className="mt-0.5 size-4 shrink-0" />
              {card.headline}
            </p>

            <Button variant="primary" size="md" fullWidth className="mt-3" onClick={goToReel}>
              {DECK_CTA.dailyMission}
            </Button>
          </Card>
        );
      })}

      <CelebrationHost celebration={celebration} onDone={() => setCelebration(null)} />
    </div>
  );
}
