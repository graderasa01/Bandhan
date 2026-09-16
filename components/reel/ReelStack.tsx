"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMotionValue } from "framer-motion";
import { Users } from "lucide-react";
import Link from "next/link";
import ReelCard from "./ReelCard";
import ReelFrame from "./ReelFrame";
import ReelHeader from "./ReelHeader";
import ReelTabs, { REEL_LENSES } from "./ReelTabs";
import ReelActionBar from "./ReelActionBar";
import ReelShortlistSheet from "./ReelShortlistSheet";
import ReelDetailsSheet from "./ReelDetailsSheet";
import ReelAISheet from "./ReelAISheet";
import ReelVoiceSheet from "./ReelVoiceSheet";
import ReelEndDiscovery from "./ReelEndDiscovery";
import IcebreakerSheet from "./IcebreakerSheet";
import AskQuestionSheet from "@/components/askBridge/AskQuestionSheet";
import ReportSheet from "@/components/safety/ReportSheet";
import AiQuotaUpgradeCard from "./AiQuotaUpgradeCard";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import Celebrate from "@/components/ui/Celebrate";
import CelebrationHost, { type Celebration } from "@/components/ui/CelebrationHost";
import { useGrio } from "@/components/grio/GrioProvider";
import { cn } from "@/lib/utils";
import type { ReelCardViewModel, ReelLens, ReelViewModel, ReelSwipeDirection } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

const KEY_TO_DIRECTION: Record<string, ReelSwipeDirection> = {
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
};

/** The "digital biodata stack" — see explain.ts §D-32 sibling doc for why AI never picks these, only explains them. */
const STACK_SIZE = 3;

/** A card that has been decided and is flying off, but is still on screen. */
type Departing = { card: ReelCardViewModel; direction: ReelSwipeDirection };

/** Does this card belong to the lens? See `ReelTabs` for what each one claims. */
function inLens(card: ReelCardViewModel, lens: ReelLens): boolean {
  switch (lens) {
    case "NEARBY":
      return card.nearby;
    case "NEW":
      return card.isNew;
    case "COMPATIBLE":
      // A *computed* comparison exists for this pair — not "a high score".
      return card.rankScore !== null;
    default:
      return true;
  }
}

/**
 * The reel screen.
 *
 * ## Position is a set, not an index
 *
 * The deck used to be walked with a cursor into `data.cards`. That works only
 * while every card is always in play; the moment a lens can hide some of them,
 * "the next card" stops being "the next index" and every rollback has to
 * re-find its card by id anyway. So the screen keeps `decided` — the ids that
 * have had a decision this session — and derives the live queue from it. A
 * replay pass is `decided.clear()`, a rolled-back interest is one `delete`,
 * and switching lens is a different filter over the same set.
 */
export default function ReelStack({ data }: { data: ReelViewModel }) {
  const t = useT();
  const { open: openGrio } = useGrio();

  const [lens, setLens] = useState<ReelLens>("FOR_YOU");
  const [decided, setDecided] = useState<Set<string>>(new Set());
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
  // on the same card during a replay pass, so these only ever grow.
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [shortlistedIds, setShortlistedIds] = useState<Set<string>>(new Set());
  const [shortlistTarget, setShortlistTarget] = useState<ReelCardViewModel | null>(null);
  const [matchedTarget, setMatchedTarget] = useState<ReelCardViewModel | null>(null);
  const [matchedMatchId, setMatchedMatchId] = useState<string | null>(null);
  const [icebreakerTarget, setIcebreakerTarget] = useState<ReelCardViewModel | null>(null);
  const [askTarget, setAskTarget] = useState<ReelCardViewModel | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<ReelCardViewModel | null>(null);
  const [aiTarget, setAiTarget] = useState<ReelCardViewModel | null>(null);
  const [voiceTarget, setVoiceTarget] = useState<ReelCardViewModel | null>(null);
  const [reportTarget, setReportTarget] = useState<ReelCardViewModel | null>(null);
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());
  const [interestLimitMessage, setInterestLimitMessage] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  const cards = data.cards;
  const queue = useMemo(
    () => cards.filter((c) => !decided.has(c.id) && inLens(c, lens)),
    [cards, decided, lens],
  );
  const current = queue[0] ?? null;
  const visible = queue.slice(0, STACK_SIZE);
  const allDecided = cards.length > 0 && decided.size >= cards.length;

  const counts = useMemo(() => {
    const out = { FOR_YOU: 0, NEARBY: 0, NEW: 0, COMPATIBLE: 0 } as Record<ReelLens, number>;
    for (const c of cards) {
      if (decided.has(c.id)) continue;
      for (const l of REEL_LENSES) if (inLens(c, l)) out[l] += 1;
    }
    return out;
  }, [cards, decided]);

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

  /** Grio, already knowing who is on screen — the same scoped conversation the
   *  profile page's Rishta Lens opens, not a second one built for the reel. */
  function askGrioAbout(card: ReelCardViewModel) {
    openGrio({ kind: "candidate", profileId: card.id, name: card.displayName });
  }

  async function commit(direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) {
    if (!current) return;
    const target = current;
    if (inFlight.current.has(target.id)) return;

    if (direction === "UP") {
      void logSwipe(target.id, direction, meta); // fire-and-forget — doesn't dismiss the card
      askGrioAbout(target);
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
    setDecided((s) => new Set(s).add(target.id));

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
      // By id — the set has no ordering to restore, which is the whole reason
      // the queue is derived rather than walked with a cursor.
      setDecided((s) => {
        const next = new Set(s);
        next.delete(target.id);
        return next;
      });
      setInterestLimitMessage(
        result.message ?? t("reel.stack.interestLimitDefault", "Is mahine ke interest khatam ho gaye hain."),
      );
      return;
    }

    if (direction === "DOWN") {
      setShortlistedIds((s) => new Set(s).add(target.id));
      setShortlistTarget(target);
    }
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
      // Reading a sheet must not decide the card underneath it — arrow keys
      // there belong to the sheet's own scroll.
      if (detailsTarget || voiceTarget || reportTarget || askTarget || aiTarget) return;
      const direction = KEY_TO_DIRECTION[e.key];
      if (!direction) return;
      e.preventDefault();
      commit(direction, { decisionMs: 0, wasButton: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, detailsTarget, voiceTarget, reportTarget, askTarget, aiTarget]);

  const emptyPool = cards.length === 0;
  const hasCard = Boolean(current) || departing.length > 0;
  const lensEmpty = !hasCard && !allDecided && !emptyPool;

  return (
    <>
      {/* ReelFrame is a passthrough on mobile and a phone-shaped window on
          desktop — see its header for why desktop needed one. */}
      <ReelFrame backdropUrl={current?.photoUnlocked ? current.photoUrl : null}>
        {/* The photograph is the screen. Header, lens pills and the action bar
            all float on top of it rather than owning rows of their own — the
            layout this rebuild exists for. Anything that is *not* a card (the
            closing card, an empty lens) gets the deep warm ground below, so the
            white chrome over it stays readable without a second, light header. */}
        <div
          className={cn(
            "relative h-full w-full overflow-hidden",
            hasCard ? "bg-grad-photo" : "bg-gradient-to-b from-wine-700 via-wine-900 to-sand-900",
          )}
        >
          {hasCard ? (
            <>
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
                  onDetails={() => setDetailsTarget(c)}
                  onVoice={c.voiceNote ? () => setVoiceTarget(c) : undefined}
                  onReport={() => setReportTarget(c)}
                  onAskGrio={() => askGrioAbout(c)}
                  previousDecision={decisions[c.id] ?? null}
                />
              ))}

              {/* Floating, not a row: a cream strip under the photo would cost
                  the person ~100px of their own screen for four buttons that
                  read perfectly well over a blurred warm wash. */}
              <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-surface via-surface/92 to-surface/0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-4">
                <ReelActionBar onAction={(d) => commit(d, { decisionMs: 0, wasButton: true })} disabled={!current} />
              </div>
            </>
          ) : emptyPool ? (
            // A genuinely empty pool — no cards were ever generated today, so
            // there's nothing to replay. Distinct from the ritual-complete
            // state: "koi rishtey nahi mile" isn't the same news as "aaj khatam".
            <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-lg font-semibold text-white">{data.emptyState?.title}</p>
              <p className="text-[0.875rem] leading-relaxed text-white/75">{data.emptyState?.description}</p>
            </div>
          ) : lensEmpty ? (
            // The lens, not the day, is empty — say which, and offer the way back.
            <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-3 px-6 pt-24 text-center">
              <p className="text-[0.9375rem] font-semibold text-white">
                {t("reel.lensEmpty.title", "Is lens me aaj koi profile nahi bachi.")}
              </p>
              <p className="text-[0.875rem] leading-relaxed text-white/75">
                {t("reel.lensEmpty.body", "Aaj ke baaki rishtey “For You” me hain.")}
              </p>
              <Button variant="primary" size="md" onClick={() => setLens("FOR_YOU")}>
                {t("reel.tabs.forYou", "For You")}
              </Button>
            </div>
          ) : (
            <div className="flex h-full flex-col pt-[calc(7.5rem+env(safe-area-inset-top,0px))]">
              <ReelEndDiscovery
                cards={cards}
                decisions={decisions}
                sentCount={sentIds.size}
                shortlistCount={shortlistedIds.size}
                dailyLimit={data.dailyLimit}
                questions={data.refineQuestions}
                preferenceNotice={data.preferenceNotice}
                onReplay={() => {
                  setDecided(new Set());
                  setLens("FOR_YOU");
                }}
              />
            </div>
          )}

          {/* On top of everything, always in the same place — the chrome does
              not move or restyle between a card, an empty lens and the close of
              the day, so the screen never appears to reload underneath it. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top,0px)]">
            <div className="pointer-events-auto">
              <ReelHeader viewer={data.viewer} />
            </div>
            {!emptyPool && (
              <div className="pointer-events-auto">
                <ReelTabs
                  active={lens}
                  counts={counts}
                  seen={decided.size}
                  total={cards.length}
                  onChange={setLens}
                />
              </div>
            )}
          </div>
        </div>
      </ReelFrame>

      {/* Sheets live outside the frame: they are screen-level surfaces and must
          cover the whole viewport on desktop, not just the phone window. */}
      <ReelShortlistSheet
        open={shortlistTarget !== null}
        onClose={() => setShortlistTarget(null)}
        displayName={shortlistTarget?.displayName ?? ""}
      />
      <ReelDetailsSheet
        open={detailsTarget !== null}
        onClose={() => setDetailsTarget(null)}
        card={detailsTarget}
        onAction={(direction) => {
          setDetailsTarget(null);
          commit(direction, { decisionMs: 0, wasButton: true });
        }}
        // The plan's `aiAskPerDay` product, kept alive and given a home next to
        // the facts it answers from. The card's own "Ask Grio" is the other,
        // bigger conversation — see this sheet's prop docs for the split.
        onAskAi={detailsTarget ? () => setAiTarget(detailsTarget) : undefined}
        onAskPerson={
          data.askBridgeEnabled && detailsTarget ? () => setAskTarget(detailsTarget) : undefined
        }
      />
      <ReelAISheet
        open={aiTarget !== null}
        onClose={() => setAiTarget(null)}
        profileId={aiTarget?.id ?? null}
        displayName={aiTarget?.displayName ?? ""}
      />
      <ReelVoiceSheet
        open={voiceTarget !== null}
        onClose={() => setVoiceTarget(null)}
        displayName={voiceTarget?.displayName ?? ""}
        voice={voiceTarget?.voiceNote ?? null}
      />
      <ReportSheet
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        targetProfileId={reportTarget?.id}
        targetLabel={reportTarget?.displayName ?? ""}
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

      <Sheet
        open={interestLimitMessage !== null}
        onClose={() => setInterestLimitMessage(null)}
        title={t("reel.stack.interestLimitTitle", "Is mahine ke interest khatam")}
      >
        {interestLimitMessage && <AiQuotaUpgradeCard message={interestLimitMessage} />}
      </Sheet>

      <Sheet open={matchedTarget !== null} onClose={() => setMatchedTarget(null)} variant="center">
        <div className="on-deep relative overflow-hidden rounded-lg bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 px-6 py-8 text-center">
          <Celebrate trigger={matchedTarget !== null} origin="top" />
          <span className="relative mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg shadow-gold">
            <Users className="size-7" />
          </span>
          <h3 className="relative mt-4 font-[family-name:var(--font-display)] text-xl font-bold text-white">
            {t("reel.stack.matchedTitle", "Aapka aur {name} ka rishta jud gaya").replace(
              "{name}",
              matchedTarget?.displayName ?? "",
            )}
          </h3>
          <p className="relative mx-auto mt-2 max-w-[26rem] text-[0.875rem] leading-relaxed text-gold-100/90">
            {t(
              "reel.stack.matchedDescription",
              "Dono taraf se interest confirm ho gaya hai — ab photo aur baaki details dikhengi, aur aap baat shuru kar sakte hain.",
            )}
          </p>
          <div className="relative mt-5 flex justify-center gap-2">
            <Button variant="secondary" size="md" onClick={() => setMatchedTarget(null)}>
              {t("reel.stack.later", "Baad Me")}
            </Button>
            <Link href={matchedMatchId ? `/user/messages/${matchedMatchId}` : "/user/messages"}>
              <Button variant="primary" size="md">
                {t("reel.stack.startChat", "Start Chat")}
              </Button>
            </Link>
          </div>
        </div>
      </Sheet>
    </>
  );
}
