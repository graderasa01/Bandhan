import { ArrowLeftRight, Brain, Check, CircleDashed, CircleHelp, Lock, MessageCircleQuestion, Send, Sparkles } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GlassCard, Icon, PrimaryButton, SecondaryButton, Text } from "~/components";
import type { GrioEvidenceCard, GrioEvidenceRow } from "~/shared/grio/grioProfile";
import { radius, useTheme } from "~/theme";
import { firstNameOf } from "~/utils/names";
import { learnOptionLabel, learnQuestion, matchLearnOption } from "../engine/learn";
import type { RememberedFact } from "../engine/types";
import { useGrio, useGrioState } from "../GrioProvider";

/**
 * A line Grio drafted for the member to send — a message (`<<<SEND>>>`) or an
 * Ask Bridge question (`<<<ASK>>>`). It is only ever a suggestion: pressing it
 * opens the editor, where the words can be changed up to the last moment and
 * nothing leaves without Send.
 */
export const GrioDraftCard = memo(function GrioDraftCard({
  messageId,
  kind,
  text,
  recipient,
}: {
  messageId: string;
  kind: "send" | "ask";
  text: string;
  recipient: string | null;
}) {
  const engine = useGrio();
  const running = useGrioState((s) => s.running);
  const first = recipient ? firstNameOf(recipient) : null;
  return (
    <GlassCard padding={14} level="strong" active style={styles.block}>
      <View style={styles.row}>
        <Icon icon={kind === "send" ? Send : MessageCircleQuestion} size={14} tone="gold" />
        <Text variant="label" tone="gold" style={{ flex: 1 }} numberOfLines={1}>
          {kind === "send" ? "Suggested message" : "Suggested question"}
          {first ? ` · ${first}` : ""}
        </Text>
      </View>
      <Text variant="body" style={styles.quote}>
        “{text}”
      </Text>
      <PrimaryButton
        size="sm"
        fullWidth={false}
        icon={kind === "send" ? Send : MessageCircleQuestion}
        label={kind === "ask" ? "Ask This" : first ? `Send to ${first}` : "Send"}
        accessibilityHint="Opens the editor — nothing is sent until you press Send there"
        disabled={running}
        onPress={() => engine.openDraft(messageId, kind, text)}
        style={{ alignSelf: "flex-start", marginTop: 10 }}
      />
    </GlassCard>
  );
});

/**
 * "Maine ye samjha — sahi hai?" — a Marriage Intelligence answer heard in
 * conversation. The catalog's own question and option, and a tap; nothing is
 * stored until then. An option the model got slightly wrong falls through to
 * the full list rather than being dropped (the web card's rule).
 */
export const GrioLearnCard = memo(function GrioLearnCard({
  messageId,
  learnKey,
  proposed,
  saved,
}: {
  messageId: string;
  learnKey: string;
  proposed: string;
  saved: string | undefined;
}) {
  const engine = useGrio();
  const t = useTheme();
  const running = useGrioState((s) => s.running);
  const [picking, setPicking] = useState(false);
  const question = learnQuestion(learnKey);
  if (!question) return null;
  const matched = matchLearnOption(question, proposed);

  if (saved) {
    return (
      <GlassCard padding={12} level="soft" style={styles.block}>
        <View style={styles.row}>
          <Icon icon={Check} size={15} tone="success" />
          <Text variant="small" style={{ flex: 1 }}>
            {question.label}: <Text variant="smallStrong">{learnOptionLabel(saved)}</Text>
          </Text>
        </View>
      </GlassCard>
    );
  }

  const showOptions = picking || matched === null;
  return (
    <GlassCard padding={14} level="strong" style={styles.block}>
      <View style={styles.row}>
        <Icon icon={Sparkles} size={14} tone="gold" />
        <Text variant="label" tone="gold">
          Profile me save karein?
        </Text>
      </View>
      <Text variant="body" style={{ marginTop: 6 }}>
        {question.question}
      </Text>
      {showOptions ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          {question.options.map((option) => (
            <SecondaryButton
              key={option}
              size="sm"
              label={learnOptionLabel(option)}
              disabled={running}
              onPress={() => void engine.saveLearn(messageId, learnKey, option)}
            />
          ))}
        </View>
      ) : (
        <>
          <View style={[styles.heard, { borderColor: t.colors.hairline, backgroundColor: t.colors.chip }]}>
            <Text variant="bodyStrong">{learnOptionLabel(matched!)}</Text>
          </View>
          <View style={styles.pair}>
            <PrimaryButton size="sm" label="Yes, Save" fullWidth={false} style={{ flex: 1 }} disabled={running} onPress={() => void engine.saveLearn(messageId, learnKey, matched!)} />
            <SecondaryButton size="sm" label="Something Else" fullWidth={false} style={{ flex: 1 }} disabled={running} onPress={() => setPicking(true)} />
          </View>
        </>
      )}
      {question.visibility !== "PROFILE_VISIBLE" ? (
        <Text variant="caption" tone="muted" style={{ marginTop: 8 }}>
          Ye jawab kisi ko dikhega nahi — sirf matching me kaam aata hai.
        </Text>
      ) : null}
    </GlassCard>
  );
});

const EVIDENCE_ICON: Record<GrioEvidenceRow["status"], { icon: typeof Check; tone: "success" | "warn" | "muted"; label: string }> = {
  match: { icon: Check, tone: "success", label: "Milta hai" },
  partial: { icon: CircleDashed, tone: "warn", label: "Thoda alag" },
  different: { icon: ArrowLeftRight, tone: "warn", label: "Alag hai" },
  unknown: { icon: CircleHelp, tone: "muted", label: "Pata nahi" },
  locked: { icon: Lock, tone: "muted", label: "Baad me khulega" },
};

/**
 * What code compared, beside what Grio said about it — both sides visible, so
 * "location aligns" can be checked with the member's own eyes. Grouped
 * similar / different / unknown, never a percentage.
 */
export const GrioEvidence = memo(function GrioEvidence({ card }: { card: GrioEvidenceCard }) {
  const t = useTheme();
  return (
    <GlassCard padding={14} level="default" style={styles.block}>
      <Text variant="label" tone="muted">
        {card.title}
      </Text>
      {card.groups.map((group) => (
        <View key={group.status} style={{ marginTop: 10 }}>
          <Text variant="smallStrong">{group.label}</Text>
          {group.rows.map((row) => {
            const look = EVIDENCE_ICON[row.status];
            // `yours` arrives already worded by the server ("Aap: Delhi", "Aapki pasand: …").
            const sides = [row.yours, row.theirs ? `Profile: ${row.theirs}` : null].filter(Boolean).join(" · ");
            return (
              <View key={row.key} style={[styles.evRow, { borderTopColor: t.colors.divider }]}>
                <View accessibilityLabel={look.label}>
                  <Icon icon={look.icon} size={15} tone={look.tone} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="small" style={{ fontWeight: "600" }}>
                    {row.label}
                  </Text>
                  {sides ? (
                    <Text variant="caption" tone="secondary">
                      {sides}
                    </Text>
                  ) : null}
                  {row.note ? (
                    <Text variant="caption" tone="muted">
                      {row.note}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}
      {card.footnote ? (
        <Text variant="caption" tone="muted" style={{ marginTop: 10 }}>
          {card.footnote}
        </Text>
      ) : null}
    </GlassCard>
  );
});

/** What Grio saved to its memory from this reply — visible, with Undo, so nothing is kept unseen. */
export const GrioRemembered = memo(function GrioRemembered({ messageId, items }: { messageId: string; items: RememberedFact[] }) {
  const engine = useGrio();
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {items.map((item, index) => (
        <View key={`${item.fact}-${index}`} style={[styles.memory, { borderColor: t.colors.hairline, backgroundColor: t.colors.chip }]}>
          <Icon icon={Brain} size={14} tone={item.undone ? "muted" : "gold"} />
          <Text variant="caption" tone={item.undone ? "muted" : "secondary"} style={{ flex: 1 }} numberOfLines={2}>
            {item.undone ? "Bhula diya" : "Grio ne yaad rakha"}: {item.fact}
          </Text>
          {!item.undone && item.itemId ? (
            <Pressable onPress={() => void engine.forget(messageId, index)} accessibilityRole="button" accessibilityLabel={`Forget: ${item.fact}`} hitSlop={8}>
              <Text variant="smallStrong" tone="gold">
                Undo
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  block: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  quote: { marginTop: 6, fontStyle: "italic" },
  heard: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  pair: { flexDirection: "row", gap: 8, marginTop: 10 },
  evRow: { flexDirection: "row", gap: 10, paddingTop: 7, marginTop: 7, borderTopWidth: StyleSheet.hairlineWidth },
  memory: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1 },
});
