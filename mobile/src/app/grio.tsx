import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ChevronDown, RotateCcw } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Appear, GlassCard, GlassSurface, GrioSeal, IconButton, RoomBackground, SecondaryButton, Text } from "~/components";
import { GrioComposer } from "~/features/grio/components/GrioComposer";
import { GrioContextBar } from "~/features/grio/components/GrioContextBar";
import { GrioMessageView } from "~/features/grio/components/GrioMessageView";
import { GrioPill } from "~/features/grio/components/GrioPill";
import { GrioRail } from "~/features/grio/components/GrioRail";
import { GrioSheets } from "~/features/grio/components/GrioSheets";
import { displayText } from "~/features/grio/engine/plan";
import { GENERAL_STARTERS } from "~/features/grio/engine/starters";
import type { GrioMessage } from "~/features/grio/engine/types";
import { useGrio, useGrioState } from "~/features/grio/GrioProvider";
import { parseGrioSegments } from "~/shared/grio/grio";
import { layout, radius, useTheme } from "~/theme";
import { firstNameOf } from "~/utils/names";

type Row = { kind: "divider"; key: string; label: string } | { kind: "message"; key: string; message: GrioMessage; latest: boolean };

/**
 * `bandhantak://grio?intent=…` — the questions a system assistant (Siri,
 * Google Assistant) or a notification may open Grio with. A fixed list: a link
 * can pick one of these, never put its own words (or anybody's id) into Grio.
 * See docs/bandhantak/16_mobile_grio_parity_plan.md §4.
 */
const LINK_INTENTS: Record<string, string> = {
  today: "Aaj ke profiles dikhao",
  inbox: "Mere unread messages kya hain?",
  pending: "Mera abhi kya pending hai?",
  profile: "Meri profile me kya incomplete hai?",
};

/**
 * The Grio room — the app's one conversation with Grio, over the admin's room
 * (photo, glass, Classic paper: all from the theme, nothing of its own).
 *
 * Everything on it goes through the one turn engine (`useGrio()`): what is
 * typed, a chip, a card's button, an "Ask Grio" from a reel or a chat. The
 * screen only draws the conversation and the sheets the engine asks for.
 */
export default function GrioRoom() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const engine = useGrio();
  const messages = useGrioState((s) => s.messages);
  const dividers = useGrioState((s) => s.dividers);
  const scope = useGrioState((s) => s.scope);
  const scopeStart = useGrioState((s) => s.scopeStart);
  const sending = useGrioState((s) => s.sending);
  const error = useGrioState((s) => s.error);
  const discovery = useGrioState((s) => s.discovery);

  // Mounted = on screen. Opened straight from a link (no entry point), it opens
  // like the dashboard does: with the day's briefing — and with the link's one
  // whitelisted question, if it carried one.
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const linked = intent && Object.prototype.hasOwnProperty.call(LINK_INTENTS, intent) ? LINK_INTENTS[intent] : null;
  useEffect(() => {
    engine.setVisible(true);
    const s = engine.store.getState();
    if (linked) {
      engine.open({ kind: "dashboard" }, { ask: linked });
      // Spent: coming back to this screen must not ask it again.
      router.setParams({ intent: "" });
    } else if (s.messages.length === 0 && !s.briefed && !s.scope && !s.discovery) {
      engine.open({ kind: "dashboard" });
    }
    return () => engine.setVisible(false);
  }, [engine, linked]);

  // A screen reader hears each new reply, as a sighted member sees it arrive.
  const announced = useRef<string | null>(null);
  const last = messages[messages.length - 1];
  useEffect(() => {
    if (!last || last.role !== "assistant" || announced.current === last.id) return;
    announced.current = last.id;
    const spoken = parseGrioSegments(last.content)
      .map((s) => (s.type === "text" ? displayText(s.value) : ""))
      .join(" ")
      .trim()
      .slice(0, 400);
    if (!spoken) return;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (on) AccessibilityInfo.announceForAccessibility(`Grio: ${spoken}`);
    });
  }, [last]);

  const rows = useMemo<Row[]>(() => {
    let latestId: string | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role === "assistant" && m.kind === "turn") {
        latestId = i >= scopeStart ? m.id : null;
        break;
      }
    }
    const out: Row[] = [];
    messages.forEach((m, i) => {
      const divider = dividers[i];
      if (divider) out.push({ kind: "divider", key: `d${i}`, label: divider });
      out.push({ kind: "message", key: m.id, message: m, latest: m.id === latestId });
    });
    const tail = dividers[messages.length];
    if (tail) out.push({ kind: "divider", key: `d${messages.length}`, label: tail });
    return out.reverse(); // inverted list: newest first
  }, [messages, dividers, scopeStart]);

  const subtitle =
    scope?.kind === "candidate"
      ? `${firstNameOf(scope.name)} ki profile par baat`
      : scope?.kind === "match"
        ? `${firstNameOf(scope.name)} ke liye message`
        : discovery
          ? "Aapki search ke saath"
          : "AI saathi · faisla hamesha aapka";

  const intro =
    scope?.kind === "candidate"
      ? `${firstNameOf(scope.name)} ki profile ke baare me poochhiye — summary, common baatein, kya missing hai. Grio samjhata hai, faisla aapka hi rahega.`
      : scope?.kind === "match"
        ? `${firstNameOf(scope.name)} ke liye message likhne me madad — icebreaker, reply, ya kuch aur. Bhejne se pehle aap hamesha badal sakte hain.`
        : "Aaj ke rishtey, messages, apni profile — kuch bhi poochhiye ya kahiye. Grio dikhata aur samjhata hai; kisi insaan ke baare me faisla hamesha aapka.";

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]}>
      <RoomBackground />
      <StatusBar style={t.statusBar} />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "web" ? undefined : "padding"}>
        <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
          <GlassSurface level="default" radius={radius.xl} style={styles.header}>
            <GrioSeal size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title" tone="gold" accessibilityRole="header">
                Grio
              </Text>
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            <IconButton
              icon={RotateCcw}
              label="New conversation"
              size={40}
              disabled={sending}
              onPress={() => {
                engine.reset();
                engine.open({ kind: "dashboard" });
              }}
            />
            <IconButton icon={ChevronDown} label="Close Grio" size={40} onPress={() => engine.dismiss()} />
          </GlassSurface>
          <GrioContextBar />
        </View>

        <FlatList
          data={rows}
          inverted
          keyExtractor={(r) => r.key}
          style={styles.root}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) =>
            item.kind === "divider" ? (
              <View style={styles.dividerRow} accessibilityRole="text">
                <GlassSurface level="soft" radius={radius.pill} shadow={false} style={styles.dividerPill}>
                  <Text variant="caption" tone="secondary">
                    {item.label}
                  </Text>
                </GlassSurface>
              </View>
            ) : (
              <Appear from="below" distance={10} duration={260}>
                <GrioMessageView message={item.message} isLatestReply={item.latest} />
              </Appear>
            )
          }
          ListHeaderComponent={
            <View style={{ gap: 10 }}>
              {sending ? (
                <View style={styles.thinkingRow} accessibilityLiveRegion="polite" accessibilityLabel="Grio soch raha hai">
                  <GrioSeal size={28} />
                  <GlassSurface level="soft" radius={radius.pill} shadow={false} style={styles.thinking}>
                    <ActivityIndicator size="small" color={t.colors.gold} />
                    <Text variant="small" tone="secondary">
                      Soch rahe hain…
                    </Text>
                  </GlassSurface>
                </View>
              ) : null}
              {error ? (
                <GlassSurface level="soft" radius={radius.md} shadow={false} style={styles.error} accessibilityLiveRegion="assertive">
                  <Text variant="small" tone="danger" style={{ flex: 1 }}>
                    {error.message}
                  </Text>
                  {error.code === "network" || error.code === "timeout" || error.code === "upstream_error" ? (
                    <SecondaryButton size="sm" fullWidth={false} label="Retry" onPress={() => void engine.retry()} />
                  ) : null}
                </GlassSurface>
              ) : null}
            </View>
          }
          ListFooterComponent={
            messages.length === 0 && !sending ? (
              <GlassCard padding={20} level="default" style={styles.intro}>
                <View style={{ alignItems: "center", gap: 10 }}>
                  <GrioSeal size={56} />
                  <Text variant="h2" center>
                    Kya madad karun?
                  </Text>
                  <Text variant="small" tone="secondary" center>
                    {intro}
                  </Text>
                </View>
                {!scope ? (
                  <View style={styles.starters}>
                    {GENERAL_STARTERS.map((s) => (
                      <GrioPill key={s.id} label={s.label} onPress={() => void engine.ask(s.ask, { source: "chip" })} />
                    ))}
                  </View>
                ) : null}
              </GlassCard>
            ) : null
          }
        />

        <GlassSurface level="strong" radius={radius.xl} style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) + radius.xl }]}>
          <GrioRail />
          <GrioComposer placeholder={scope?.kind === "match" ? "Kya likhna hai, bataiye…" : "Grio se poochhiye ya kahiye…"} />
        </GlassSurface>
      </KeyboardAvoidingView>
      <GrioSheets />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: 12, gap: 8, width: "100%", maxWidth: layout.maxContentWidth + 24, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 10, paddingRight: 6, paddingVertical: 6 },
  list: { paddingHorizontal: 12, paddingVertical: 12, gap: 12, width: "100%", maxWidth: layout.maxContentWidth + 24, alignSelf: "center" },
  dividerRow: { alignItems: "center" },
  dividerPill: { paddingHorizontal: 12, paddingVertical: 5 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9 },
  error: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  intro: { marginBottom: 8 },
  starters: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 },
  dock: { marginBottom: -radius.xl, paddingTop: 2, width: "100%", maxWidth: layout.maxContentWidth + 40, alignSelf: "center" },
});
