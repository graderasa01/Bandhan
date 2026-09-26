import { CircleAlert, CircleCheck } from "lucide-react-native";
import { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { AnswerChips, GhostButton, GlassQuestionCard, Icon, RoomBackground, Text } from "~/components";
import { FEED_PREFERENCE_KEYS } from "~/features/reels/buildFeed";
import { layout } from "~/theme";
import type { ReelRefineQuestion } from "~/types/api";

/** How long "Saved" stays on screen before the feed moves on by itself (the web's `SAVED_HOLD_MS`). */
const SAVED_HOLD_MS = 900;

/**
 * "Reel dekhte-dekhte profile": one of the member's own unanswered fields,
 * asked between two people (the web's `ReelQuestionPage`; the rules are
 * lib/reel/feedQuestions.ts).
 *
 * It is a page of the feed, not an overlay: it arrives the way the next person
 * would, over the room rather than anyone's photo, and asks in the same words
 * and the same glass as Bolo — Grio's question card, Bolo's chips.
 *
 *   - **A chip is the only thing that writes** — the member's own confirmed
 *     word, through the ordinary autosave. "Saved" shows on the card and the
 *     feed moves on by itself, if this page is still the one on screen.
 *   - **Skip and a plain scroll write nothing.**
 *   - **A save that did not land says so and stays.** The feed never moves on
 *     a failed save, or the member would believe an answer the server never got.
 *   - **The page keeps its place.** An answer never removes it from the feed
 *     (nothing jumps under the thumb); it just shows what was saved, even when
 *     the list re-creates the page while scrolling.
 */
export const FeedQuestionPage = memo(function FeedQuestionPage({
  question,
  saved,
  height,
  topInset,
  bottomInset,
  onAnswer,
  onNext,
}: {
  question: ReelRefineQuestion;
  /** The value saved from this page this visit, if any. */
  saved: string | undefined;
  height: number;
  topInset: number;
  bottomInset: number;
  /** Resolves true once the server has it. */
  onAnswer: (key: string, value: string) => Promise<boolean>;
  /** Moves the feed on — ignored by the parent unless this page is the one on screen. */
  onNext: (key: string) => void;
}) {
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );

  const preference = FEED_PREFERENCE_KEYS.has(question.key);

  const answer = async (value: string) => {
    if (busy || saved) return;
    setBusy(value);
    setFailed(false);
    const ok = await onAnswer(question.key, value);
    setBusy(null);
    if (!ok) {
      setFailed(true);
      return;
    }
    hold.current = setTimeout(() => onNext(question.key), SAVED_HOLD_MS);
  };

  const chips = question.options.map((option) => ({ id: option, label: option, selected: saved === option }));

  return (
    <View style={{ height, width }}>
      <RoomBackground />
      <View style={[styles.center, { paddingTop: topInset + 64, paddingBottom: bottomInset + 24 }]}>
        <View style={styles.column} accessibilityLabel="Aapki profile ka ek sawaal">
          <GlassQuestionCard
            id={question.key}
            eyebrow="Aapki profile · ek sawaal"
            question={question.question}
            hint={
              preference
                ? "Aapki pasand — aage ke rishte isi hisaab se chune jayenge."
                : "Ek tap me aapki profile me jud jayega. Baad me kabhi bhi badal sakte hain."
            }
            compact
          >
            <View style={styles.chips}>
              <AnswerChips
                chips={chips}
                label={question.question}
                disabled={busy !== null || saved !== undefined}
                busyId={busy}
                onPick={(id) => void answer(id)}
              />
            </View>
            {saved ? (
              <View style={styles.status} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Icon icon={CircleCheck} size={17} tone="success" />
                <Text variant="smallStrong" tone="success" style={styles.statusText}>
                  Save ho gaya — profile me jud gaya.
                </Text>
              </View>
            ) : failed ? (
              <View style={styles.status} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                <Icon icon={CircleAlert} size={17} tone="danger" />
                <Text variant="smallStrong" tone="danger" style={styles.statusText}>
                  Save nahi ho paaya — dobara try karein.
                </Text>
              </View>
            ) : null}
          </GlassQuestionCard>
          <View style={styles.foot}>
            <Text variant="small" tone="secondary" style={styles.footHint}>
              Upar swipe karein to agli profile
            </Text>
            <GhostButton label={saved ? "Next" : "Skip"} size="sm" disabled={busy !== null} onPress={() => onNext(question.key)} />
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: layout.gutter },
  column: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center", gap: 14 },
  chips: { marginTop: 16 },
  status: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  statusText: { flex: 1 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 6 },
  footHint: { flex: 1 },
});
