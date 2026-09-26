import { LinearGradient } from "expo-linear-gradient";
import { CircleAlert, CircleCheck, Info, Undo2 } from "lucide-react-native";
import { memo, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GlassCard, GlassSurface, GrioSeal, Icon, Text } from "~/components";
import { parseGrioSegments, type GrioSegment } from "~/shared/grio/grio";
import { radius, useTheme } from "~/theme";
import { chipsFor, displayText } from "../engine/plan";
import type { GrioMessage } from "../engine/types";
import { useGrio, useGrioState } from "../GrioProvider";
import { GrioActionChips, GrioProfileNext } from "./GrioActions";
import { GrioDraftCard, GrioEvidence, GrioLearnCard, GrioRemembered } from "./GrioCards";
import { GrioPeople } from "./GrioPeople";

type Block =
  | { kind: "text"; value: string }
  | { kind: "send" | "ask"; value: string }
  | { kind: "learn"; key: string; value: string };

/**
 * The one piece of markdown replies use — `**bold**` — shown as weight rather
 * than asterisks. Nothing else is interpreted; the words are the model's own.
 */
function Prose({ text }: { text: string }) {
  const parts = text.split(/\*\*([^*\n]+)\*\*/g);
  return (
    <Text variant="body" selectable>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} variant="bodyStrong">
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

/** Consecutive prose joins one bubble; a draft or a LEARN card sits where the reply put it. */
function blocksOf(segments: GrioSegment[]): Block[] {
  const out: Block[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      const value = displayText(seg.value);
      if (!value) continue;
      const last = out[out.length - 1];
      if (last?.kind === "text") last.value = `${last.value}\n\n${value}`;
      else out.push({ kind: "text", value });
    } else if (seg.type === "send" || seg.type === "ask") {
      out.push({ kind: seg.type, value: seg.value });
    } else if (seg.type === "learn") {
      out.push({ kind: "learn", key: seg.key, value: seg.value });
    }
  }
  return out;
}

/**
 * One line of the conversation. The member's words on the right in the room's
 * accent; Grio's on the left on the room's glass (Classic's paper); code's
 * outcome lines as quiet status rows. Markers never reach the screen: the
 * reply is read by the web's parser, and prose passes `displayText`.
 */
export const GrioMessageView = memo(function GrioMessageView({ message, isLatestReply }: { message: GrioMessage; isLatestReply: boolean }) {
  if (message.role === "user") return <UserBubble text={message.content} />;
  if (message.kind === "outcome") return <OutcomeLine message={message} />;
  return <AssistantReply message={message} isLatestReply={isLatestReply} />;
});

const UserBubble = memo(function UserBubble({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={styles.userWrap} accessibilityLabel={`Aap: ${text}`}>
      <LinearGradient colors={t.gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userBubble}>
        <Text variant="body" style={{ color: t.colors.accentFg }} selectable>
          {text}
        </Text>
      </LinearGradient>
    </View>
  );
});

const AssistantReply = memo(function AssistantReply({ message, isLatestReply }: { message: GrioMessage; isLatestReply: boolean }) {
  const scope = useGrioState((s) => s.scope);
  const segments = useMemo(() => parseGrioSegments(message.content), [message.content]);
  const blocks = useMemo(() => blocksOf(segments), [segments]);
  const chips = chipsFor(message, segments);
  const meta = message.meta;
  const matchName = scope?.kind === "match" ? scope.name : null;

  return (
    <View style={styles.replyRow}>
      <View style={styles.sealSlot}>
        <GrioSeal size={28} />
      </View>
      <View style={styles.replyBody}>
        {message.kind === "briefing" ? (
          <Text variant="label" tone="gold">
            Aaj ka haal
          </Text>
        ) : null}
        {blocks.map((b, i) =>
          b.kind === "text" ? (
            <GlassCard key={i} padding={14} level="default" style={styles.bubble}>
              <Prose text={b.value} />
            </GlassCard>
          ) : b.kind === "learn" ? (
            <GrioLearnCard key={i} messageId={message.id} learnKey={b.key} proposed={b.value} saved={message.learned?.[b.key]} />
          ) : (
            <GrioDraftCard
              key={i}
              messageId={message.id}
              kind={b.kind}
              text={b.value}
              recipient={b.kind === "send" ? (message.sendTarget?.name ?? matchName) : (message.askTarget?.name ?? null)}
            />
          ),
        )}
        {meta?.evidence ? <GrioEvidence card={meta.evidence} /> : null}
        {message.cards?.length ? <GrioPeople messageId={message.id} profileIds={message.cards} /> : null}
        {meta?.profileId ? (
          <GrioProfileNext messageId={message.id} actions={meta.profileActions} followUps={isLatestReply ? meta.followUps : []} />
        ) : null}
        {message.remembered?.length ? <GrioRemembered messageId={message.id} items={message.remembered} /> : null}
        <GrioActionChips messageId={message.id} keys={chips} />
      </View>
    </View>
  );
});

const OutcomeLine = memo(function OutcomeLine({ message }: { message: GrioMessage }) {
  const engine = useGrio();
  const running = useGrioState((s) => s.running);
  const text = displayText(message.content.replace(/^✓\s*/, ""));
  const tone = message.tone ?? "info";
  const icon = tone === "success" ? CircleCheck : tone === "error" ? CircleAlert : Info;
  const undo = message.undo;
  return (
    <View style={styles.outcomeWrap}>
      <GlassSurface level="soft" radius={radius.md} shadow={false} style={styles.outcome} accessibilityRole="text" accessibilityLiveRegion="polite">
        <Icon icon={icon} size={17} tone={tone === "success" ? "success" : tone === "error" ? "danger" : "gold"} />
        <Text variant="small" tone={tone === "error" ? "danger" : "primary"} style={{ flex: 1 }}>
          {text}
        </Text>
        {undo && !undo.done ? (
          <Pressable
            onPress={() => void engine.undo(message.id)}
            disabled={running}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            hitSlop={8}
            style={styles.undo}
          >
            <Icon icon={Undo2} size={15} tone="gold" />
            <Text variant="smallStrong" tone="gold">
              Undo
            </Text>
          </Pressable>
        ) : null}
      </GlassSurface>
      {message.cards?.length ? <GrioPeople messageId={message.id} profileIds={message.cards} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  userWrap: { alignSelf: "flex-end", maxWidth: "86%" },
  userBubble: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: radius.lg, borderBottomRightRadius: 6 },
  replyRow: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
  sealSlot: { paddingTop: 4 },
  replyBody: { flex: 1, gap: 8, minWidth: 0 },
  bubble: { alignSelf: "flex-start", maxWidth: "100%" },
  outcomeWrap: { gap: 8, alignSelf: "stretch", paddingLeft: 36 },
  outcome: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  undo: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 4 },
});
