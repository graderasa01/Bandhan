import { AlertCircle, Blend, Check, ChevronRight, Info, Orbit, Sparkles } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheet, Icon, PrimaryButton, Text } from "~/components";
import { radius, useTheme } from "~/theme";
import type { ReelCard } from "~/types/api";
import { firstNameOf } from "~/utils/names";

interface Line {
  text: string;
  ai: boolean;
}

/** `lib/reel/insights.ts` `reelReasons` — the server's lines, in the server's order; nothing added. */
function reasonsOf(card: ReelCard): Line[] {
  const why = card.whyThisMatch;
  return [...(why.valueConnection ? [{ text: why.valueConnection, ai: false }] : []), ...why.reasons.map((r) => ({ text: r.text, ai: r.kind === "ai" }))];
}

/** `reelCautions` — a real gap, the AI's cached concern (tagged), a widened range, a kundli caution. */
function cautionsOf(card: ReelCard): Line[] {
  const out: Line[] = [];
  if (card.whyThisMatch.unclear) out.push({ text: card.whyThisMatch.unclear, ai: false });
  if (card.concern) out.push({ text: card.concern, ai: true });
  if (card.preference.note) out.push({ text: card.preference.note, ai: false });
  if (card.kundli.notes.some((n) => n.tone === "caution")) out.push({ text: "Parampara ka ek note hai — Kundli me dekhein.", ai: false });
  return out;
}

/**
 * Four fixed slots, the web's `askChips`: a slot's meaning never moves, only
 * its content follows what the card actually carries — no "Family?" for a
 * card without family details, "What's missing?" in its place.
 */
function askChips(card: ReelCard) {
  const hasFamily = card.facts.some((f) => f.group === "family");
  const hasLifestyle = card.facts.some((f) => f.group === "lifestyle");
  return [
    { id: "for-me", label: "What's special for me?", ask: "Is profile me mere liye kya khaas hai?" },
    hasFamily
      ? { id: "family", label: "Family?", ask: "Family ke baare me batao." }
      : { id: "missing", label: "What's missing?", ask: "Profile me kya missing hai?" },
    hasLifestyle
      ? { id: "lifestyle", label: "Lifestyle?", ask: "Iske lifestyle ke baare me batao." }
      : { id: "common", label: "What's common?", ask: "Hum dono me kya common hai?" },
    { id: "know", label: "What should I know?", ask: "Is profile ke baare me mujhe kya jaanna chahiye?" },
  ];
}

function AiTag() {
  const t = useTheme();
  return (
    <Text variant="caption" style={[styles.ai, { color: t.colors.gold, borderColor: t.colors.gold }]}>
      AI
    </Text>
  );
}

/**
 * Grio's door on the reel — the reasons first, the conversation second (the
 * web's `ReelInsightSheet`). "Why am I seeing this person, and is there
 * anything to watch for" is already computed on the server (`whyThisMatch`),
 * so it shows at once, no model call; the conversation is one tap on, scoped
 * to this exact profile by its id. A check is something code compared; a
 * sparkle with "AI" is the model's cached phrasing. When there is nothing, it
 * says so rather than inventing a reason.
 */
export const ReelInsightSheet = memo(function ReelInsightSheet({
  card: live,
  onClose,
  onAskGrio,
  onKundli,
}: {
  card: ReelCard | null;
  onClose: () => void;
  /** Opens Grio on this card — with the chip's question already asked. */
  onAskGrio: (card: ReelCard, ask?: string) => void;
  onKundli: (card: ReelCard) => void;
}) {
  const t = useTheme();
  const [card, setCard] = useState(live);
  if (live && live !== card) setCard(live);
  if (!card) return null;

  const reasons = reasonsOf(card);
  const cautions = cautionsOf(card);
  const milan = card.kundli.milan;
  const first = firstNameOf(card.displayName);

  return (
    <BottomSheet visible={live !== null} onClose={onClose} title={`${first} — ye rishta kyun`}>
      <View style={styles.stack}>
        {reasons.length ? (
          <View style={styles.list}>
            {reasons.map((r, i) => (
              <View key={i} style={styles.line}>
                <View style={[styles.mark, { backgroundColor: t.colors.accentSoft }]}>
                  <Icon icon={r.ai ? Sparkles : i === 0 ? Blend : Check} size={13} tone="gold" />
                </View>
                <Text variant="body" style={styles.flex}>
                  {r.text} {r.ai ? <AiTag /> : null}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text variant="body" tone="secondary">
            Is baat ki jaankari abhi nahi di gayi.
          </Text>
        )}

        {cautions.length ? (
          <View style={[styles.cautions, { backgroundColor: t.colors.warnBg }]}>
            {cautions.map((c, i) => (
              <View key={i} style={styles.line}>
                <Icon icon={AlertCircle} size={15} tone="warn" />
                <Text variant="small" style={styles.flex}>
                  {c.text} {c.ai ? <AiTag /> : null}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* The tradition's view beside the app's own — a number only when it is the real one. */}
        {milan ? (
          <Pressable
            onPress={() => onKundli(card)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.guna, { borderColor: t.colors.hairline }, pressed && { opacity: 0.8 }]}
          >
            <Icon icon={Orbit} size={19} tone="gold" />
            <View style={styles.flex}>
              <Text variant="bodyStrong">
                Guna Milan: {milan.total}/{milan.max} · {milan.band}
              </Text>
              <Text variant="caption" tone="muted">
                Parampara ka ek nazariya — rishta ka faisla nahi.
              </Text>
            </View>
            <Icon icon={ChevronRight} size={16} tone="muted" />
          </Pressable>
        ) : null}

        {card.preference.state !== "COMPARABLE" && !card.preference.note ? (
          <View style={styles.line}>
            <Icon icon={Info} size={13} tone="muted" />
            <Text variant="caption" tone="muted" style={styles.flex}>
              Aapki pasand abhi kam pata hai — isliye ye wajah general hain, pasand ka percentage nahi.
            </Text>
          </View>
        ) : null}

        <View style={styles.ask}>
          <View style={styles.line}>
            <Icon icon={Sparkles} size={14} tone="gold" />
            <Text variant="smallStrong" tone="secondary">
              Grio se is profile ke baare me poochiye
            </Text>
          </View>
          <View style={styles.chips}>
            {/* Buttons, not choices: each one asks Grio its question at once. */}
            {askChips(card).map((chip) => (
              <Pressable
                key={chip.id}
                onPress={() => onAskGrio(card, chip.ask)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.askChip, { backgroundColor: t.colors.chip, borderColor: t.colors.hairline }, pressed && { opacity: 0.75 }]}
              >
                <Text variant="smallStrong" style={{ color: t.colors.chipText }}>
                  {chip.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label={`Ask Grio about ${first}`} icon={Sparkles} onPress={() => onAskGrio(card)} haptic={false} />
        </View>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 16, paddingTop: 4 },
  list: { gap: 10 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
  ai: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 3, fontSize: 9 },
  cautions: { gap: 8, padding: 12, borderRadius: radius.md },
  guna: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  ask: { gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  askChip: { minHeight: 38, paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1 },
});
