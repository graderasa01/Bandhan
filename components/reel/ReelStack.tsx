"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
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

export default function ReelStack({ data }: { data: ReelViewModel }) {
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(false);
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

  function logSwipe(profileId: string, direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) {
    return fetch("/api/reel/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, direction, reelId: data.reelId, ...meta }),
    })
      .then((r) => r.json())
      .catch(() => null);
  }

  async function commit(direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) {
    if (!current || pending) return;
    const target = current;

    if (direction === "UP") {
      void logSwipe(target.id, direction, meta); // fire-and-forget — doesn't dismiss the card
      setAiTarget(target);
      return;
    }

    setPending(true);
    const result = await logSwipe(target.id, direction, meta);
    setPending(false);

    // The month's interest quota is out — the card was deliberately never
    // marked swiped server-side for exactly this case (see the API route),
    // so it must stay in place here too rather than advancing past it.
    if (direction === "RIGHT" && result?.ok === false) {
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

    setDecisions((d) => ({ ...d, [target.id]: direction }));
    setIndex((i) => i + 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || pending) return;
      const direction = KEY_TO_DIRECTION[e.key];
      if (!direction) return;
      e.preventDefault();
      commit(direction, { decisionMs: 0, wasButton: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, pending]);

  return (
    <div className="flex h-full flex-col">
      <ReelHeader index={index} total={data.dailyLimit} />

      {current ? (
        <div className="relative mx-auto w-full max-w-md flex-1 px-4 pb-3">
          <div className="relative h-full w-full">
            <AnimatePresence>
              {[...visible].reverse().map((c, i) => {
                const depth = visible.length - 1 - i;
                return (
                  <ReelCard
                    key={c.id}
                    card={askedIds.has(c.id) && c.askedStatus === "NONE" ? { ...c, askedStatus: "PENDING" } : c}
                    draggable={depth === 0 && !pending}
                    depth={depth}
                    onDismiss={depth === 0 ? commit : () => {}}
                    onAsk={data.askBridgeEnabled ? () => setAskTarget(c) : undefined}
                    previousDecision={decisions[c.id] ?? null}
                  />
                );
              })}
            </AnimatePresence>
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
        <ReelActionBar onAction={(d) => commit(d, { decisionMs: 0, wasButton: true })} disabled={pending || !current} />
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
