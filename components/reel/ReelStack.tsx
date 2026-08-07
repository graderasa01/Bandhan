"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValue } from "framer-motion";
import { Heart } from "lucide-react";
import Link from "next/link";
import ReelCard from "./ReelCard";
import ReelHeader from "./ReelHeader";
import ReelActionBar from "./ReelActionBar";
import ReelAISheet from "./ReelAISheet";
import ReelShortlistSheet from "./ReelShortlistSheet";
import IcebreakerSheet from "./IcebreakerSheet";
import AskQuestionSheet from "@/components/askBridge/AskQuestionSheet";
import ReelEmptyState from "./ReelEmptyState";
import AiQuotaUpgradeCard from "./AiQuotaUpgradeCard";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import Celebrate from "@/components/ui/Celebrate";
import CelebrationHost, { type Celebration } from "@/components/ui/CelebrationHost";
import type { ReelCardViewModel, ReelViewModel, ReelSwipeDirection } from "@/lib/contracts/reel";

const KEY_TO_DIRECTION: Record<string, ReelSwipeDirection> = {
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
};

/** The "digital biodata stack" — see explain.ts §D-32 sibling doc for why AI never picks these, only explains them. */
const STACK_SIZE = 4;

/** A card that has been decided and is flying off, but is still on screen. */
type Departing = { card: ReelCardViewModel; direction: ReelSwipeDirection };

export default function ReelStack({ data }: { data: ReelViewModel }) {
  const [index, setIndex] = useState(0);
  const [departing, setDeparting] = useState<Departing[]>([]);
  /** Guards a card against being decided twice while its own commit is in
   *  flight — cleared once it has left the screen (or been rolled back). */
  const inFlight = useRef<Set<string>>(new Set());
  /** 0..1 commitment of the top card's live gesture. Owned here rather than by
   *  the card because the cards *behind* are the ones that read it: the pile
   *  rises with the finger and settles back if the swipe is abandoned. */
  const swipeProgress = useMotionValue(0);
  // Keyed by profileId rather than an incrementing counter so a replay pass
  // (View Again) can re-show the same card without inflating "kitno ko
  // interest bheja" — re-deciding the same profile just overwrites its entry.
  const [decisions, setDecisions] = useState<Record<string, ReelSwipeDirection>>({});
  // Separate from `decisions` (which keeps only the latest direction, for the
  // replay badge): an interest already sent can't be un-sent by a later DOWN
  // on the same card during a replay pass, so this only ever grows.
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [aiTarget, setAiTarget] = useState<ReelCardViewModel | null>(null);
  const [shortlistTarget, setShortlistTarget] = useState<ReelCardViewModel | null>(null);
  const [matchedTarget, setMatchedTarget] = useState<ReelCardViewModel | null>(null);
  const [matchedMatchId, setMatchedMatchId] = useState<string | null>(null);
  const [icebreakerTarget, setIcebreakerTarget] = useState<ReelCardViewModel | null>(null);
  const [askTarget, setAskTarget] = useState<ReelCardViewModel | null>(null);
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());
  const [interestLimitMessage, setInterestLimitMessage] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  const cards = data.cards;
  const current = cards[index] ?? null;
  const visible = cards.slice(index, index + STACK_SIZE);
  const sentCount = sentIds.size;

  // Deepest first so the top card paints last; flying cards go after everything
  // so they stay above the stack they just left.
  const layers: { card: ReelCardViewModel; depth: number; direction: ReelSwipeDirection | null }[] = [];
  for (let i = visible.length - 1; i >= 0; i--) layers.push({ card: visible[i], depth: i, direction: null });
  for (const d of departing) layers.push({ card: d.card, depth: 0, direction: d.direction });

  function logSwipe(profileId: string, direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) {
    return fetch("/api/reel/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, direction, reelId: data.reelId, ...meta }),
    })
      .then((r) => r.json())
      .catch(() => null);
  }

  /** The fly-off finished — the card can leave the DOM. */
  function handleExited(id: string) {
    setDeparting((d) => d.filter((e) => e.card.id !== id));
    inFlight.current.delete(id);
  }

  async function commit(direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) {
    if (!current) return;
    const target = current;
    if (inFlight.current.has(target.id)) return;

    if (direction === "UP") {
      void logSwipe(target.id, direction, meta); // fire-and-forget — doesn't dismiss the card
      setAiTarget(target);
      return;
    }

    const previousDecision = decisions[target.id];
    inFlight.current.add(target.id);

    // The decision is applied to the screen first and confirmed with the server
    // after. This used to be the other way round — `await logSwipe(...)` sat
    // between the finger lifting and the card moving — which on a real mobile
    // connection meant the card sprang back to centre, sat there for the whole
    // round trip, then vanished. A swipe has to answer in the same frame as the
    // gesture or it doesn't read as a swipe at all.
    swipeProgress.set(0);
    setDeparting((d) => [...d, { card: target, direction }]);
    setDecisions((d) => ({ ...d, [target.id]: direction }));
    setIndex((i) => i + 1);

    const result = await logSwipe(target.id, direction, meta);

    // The month's interest quota is out — the card was deliberately never
    // marked swiped server-side for exactly this case (see the API route), so
    // the optimistic dismissal has to be undone: the card comes back and the
    // upgrade sheet explains why.
    if (direction === "RIGHT" && result?.ok === false) {
      inFlight.current.delete(target.id);
      setDeparting((d) => d.filter((e) => e.card.id !== target.id));
      setDecisions((d) => {
        const next = { ...d };
        if (previousDecision === undefined) delete next[target.id];
        else next[target.id] = previousDecision;
        return next;
      });
      // By id, not `i - 1`: another card may have been decided while this one
      // was in flight, so the old index is no longer where this card lives.
      const restoreAt = cards.findIndex((c) => c.id === target.id);
      if (restoreAt >= 0) setIndex(restoreAt);
      setInterestLimitMessage(result.message ?? "Is mahine ke interest khatam ho gaye hain.");
      return;
    }

    if (direction === "DOWN") setShortlistTarget(target);
    if (direction === "RIGHT") {
      setSentIds((s) => new Set(s).add(target.id));
      // A mutual match is the bigger moment — the icebreaker only makes sense
      // for the common case where the other side hasn't already said yes.
      if (result?.matched) {
        setMatchedMatchId(result.matchId ?? null);
        setMatchedTarget(target);
      } else {
        setIcebreakerTarget(target);
      }
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
      const direction = KEY_TO_DIRECTION[e.key];
      if (!direction) return;
      e.preventDefault();
      commit(direction, { decisionMs: 0, wasButton: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return (
    <div className="flex h-full flex-col">
      <ReelHeader index={index} total={data.dailyLimit} />

      {current || departing.length > 0 ? (
        <div className="relative mx-auto w-full max-w-md flex-1 px-4 pb-3">
          <div className="relative h-full w-full">
            {/* Live stack and flying cards share ONE keyed array on purpose.
                Rendered as two sibling groups, a card moving from "stack" to
                "flying" would change position in the children list and React
                would unmount and remount it — losing the x/y the finger just
                put it at, so the fly-off would restart from centre. One array
                keyed by profile id means React moves the same instance and the
                throw continues from exactly where the finger let go. */}
            {layers.map(({ card: c, depth, direction }) => (
              <ReelCard
                key={c.id}
                card={askedIds.has(c.id) && c.askedStatus === "NONE" ? { ...c, askedStatus: "PENDING" } : c}
                draggable={depth === 0 && !direction}
                depth={depth}
                departing={direction}
                onExited={() => handleExited(c.id)}
                swipeProgress={swipeProgress}
                onDismiss={depth === 0 ? commit : () => {}}
                onAsk={data.askBridgeEnabled ? () => setAskTarget(c) : undefined}
                previousDecision={decisions[c.id] ?? null}
              />
            ))}
          </div>
        </div>
      ) : cards.length === 0 ? (
        // A genuinely empty pool — no cards were ever generated today, so
        // there's nothing to replay. Distinct from the ritual-complete state
        // below: "koi rishtey nahi mile" isn't the same news as "aaj khatam".
        <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-lg font-semibold text-ink">{data.emptyState?.title}</p>
          <p className="text-[0.875rem] leading-relaxed text-muted">{data.emptyState?.description}</p>
        </div>
      ) : (
        <ReelEmptyState
          dailyLimit={data.dailyLimit}
          sentCount={sentCount}
          upgradeHint={data.upgradeHint}
          onReplay={() => setIndex(0)}
        />
      )}

      <div className="mx-auto w-full max-w-md shrink-0 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <ReelActionBar onAction={(d) => commit(d, { decisionMs: 0, wasButton: true })} disabled={!current} />
      </div>

      <ReelAISheet
        open={aiTarget !== null}
        onClose={() => setAiTarget(null)}
        profileId={aiTarget?.id ?? null}
        displayName={aiTarget?.displayName ?? ""}
      />
      <ReelShortlistSheet
        open={shortlistTarget !== null}
        onClose={() => setShortlistTarget(null)}
        displayName={shortlistTarget?.displayName ?? ""}
      />
      <IcebreakerSheet
        open={icebreakerTarget !== null}
        onClose={() => setIcebreakerTarget(null)}
        profileId={icebreakerTarget?.id ?? null}
        displayName={icebreakerTarget?.displayName ?? ""}
        voiceEnabled={data.voiceEnabled}
        mission={icebreakerTarget?.mission ?? null}
        voiceQuest={data.voiceQuest}
        onCelebration={setCelebration}
      />

      <AskQuestionSheet
        open={askTarget !== null}
        onClose={() => setAskTarget(null)}
        profileId={askTarget?.id ?? null}
        displayName={askTarget?.displayName ?? ""}
        onAsked={() => {
          if (askTarget) setAskedIds((ids) => new Set(ids).add(askTarget.id));
        }}
      />

      <CelebrationHost celebration={celebration} onDone={() => setCelebration(null)} />

      <Sheet open={interestLimitMessage !== null} onClose={() => setInterestLimitMessage(null)} title="Is mahine ke interest khatam">
        {interestLimitMessage && <AiQuotaUpgradeCard message={interestLimitMessage} />}
      </Sheet>

      <Sheet open={matchedTarget !== null} onClose={() => setMatchedTarget(null)} variant="center">
        <div className="on-deep relative overflow-hidden rounded-lg bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 px-6 py-8 text-center">
          <Celebrate trigger={matchedTarget !== null} origin="top" />
          <span className="relative mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg shadow-gold">
            <Heart className="size-7" fill="currentColor" />
          </span>
          <h3 className="relative mt-4 font-[family-name:var(--font-display)] text-xl font-bold text-white">
            Aapka aur {matchedTarget?.displayName} ka rishta jud gaya
          </h3>
          <p className="relative mx-auto mt-2 max-w-[26rem] text-[0.875rem] leading-relaxed text-gold-100/90">
            Dono taraf se interest confirm ho gaya hai — ab photo aur baaki details dikhengi, aur aap baat
            shuru kar sakte hain.
          </p>
          <div className="relative mt-5 flex justify-center gap-2">
            <Button variant="secondary" size="md" onClick={() => setMatchedTarget(null)}>
              Baad Me
            </Button>
            <Link href={matchedMatchId ? `/user/messages/${matchedMatchId}` : "/user/messages"}>
              <Button variant="primary" size="md">
                Start Chat
              </Button>
            </Link>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
