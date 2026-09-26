import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { BadgeCheck, ChevronLeft, Flag, MoreVertical, SendHorizontal, Sparkles, UserRound } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, BottomSheet, ErrorState, GlassCard, Icon, IconButton, ListRow, RoomBackground, Text, toast } from "~/components";
import { ChatUnlockBar } from "~/features/chat/ChatUnlockBar";
import { MessageBubble } from "~/features/chat/MessageBubble";
import { useOpenGrio } from "~/features/grio/GrioProvider";
import { ReportSheet } from "~/features/safety/ReportSheet";
import { qk, useConversations, useSendMessage, useThread } from "~/hooks/queries";
import { ApiError, errorMessage } from "~/services/api/client";
import { useSession } from "~/store/session";
import { fonts, layout, radius, useTheme } from "~/theme";
import type { ChatMessage } from "~/types/api";
import { dayLabel } from "~/utils/time";

type Row = { kind: "msg"; message: ChatMessage } | { kind: "day"; key: string; label: string };

/**
 * One conversation. Polls every few seconds while open (the service is the
 * seam where a socket would go), marks the other side's messages read on
 * open, and respects the D-90 chat gate: a locked chat says so and offers
 * the one real way in instead of letting a message fail.
 *
 * Whether it is locked is the server's `chatOpen` on the chat list, so an
 * unlock — a free credit here, or a payment the webhook confirmed while the
 * browser had the checkout — shows up the moment that list is re-read. A send
 * refused with CHAT_LOCKED locks it at once, until the next fresh list.
 */
export default function ChatScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const meId = useSession((s) => s.user?.id);
  const thread = useThread(matchId);
  const send = useSendMessage(matchId);
  const conversations = useConversations();
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [gateHitAt, setGateHitAt] = useState<number | null>(null);
  const chatOpen = conversations.data?.find((c) => c.matchId === matchId)?.chatOpen;
  const locked = chatOpen === false || (gateHitAt !== null && conversations.dataUpdatedAt <= gateHitAt);
  const openGrio = useOpenGrio();

  const other = thread.data?.other;
  const rows = useMemo<Row[]>(() => {
    const msgs = thread.data?.messages ?? [];
    const out: Row[] = [];
    let lastDay = "";
    msgs.forEach((m) => {
      const day = dayLabel(m.createdAt);
      if (day !== lastDay) {
        out.push({ kind: "day", key: `day-${m.id}`, label: day });
        lastDay = day;
      }
      out.push({ kind: "msg", message: m });
    });
    return out.reverse(); // inverted list: newest first
  }, [thread.data?.messages]);

  async function submit() {
    const body = text.trim();
    if (!body || send.isPending) return;
    setText("");
    try {
      await send.mutateAsync(body);
    } catch (err) {
      setText(body);
      if (err instanceof ApiError && err.code === "CHAT_LOCKED") {
        setGateHitAt(Date.now());
        void qc.invalidateQueries({ queryKey: qk.conversations });
      }
      toast.error(errorMessage(err));
    }
  }

  /**
   * Grio for this conversation: scoped to this match by the app (its id is the
   * route's), so it reads this thread's last messages and drafts lines for
   * *this* person — each one an editable preview, never sent on its own.
   */
  function askGrio() {
    if (!other) return;
    openGrio({ kind: "match", matchId, name: other.displayName });
  }

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]}>
      <RoomBackground />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "web" ? undefined : "padding"}>
        <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: t.colors.divider, backgroundColor: t.colors.tabBar }]}>
          <IconButton icon={ChevronLeft} label="Back" size={40} variant="plain" onPress={() => (router.canGoBack() ? router.back() : router.replace("/chats"))} />
          <Pressable
            style={styles.who}
            onPress={() => other?.profileId && router.push(`/profile/${other.profileId}`)}
            accessibilityRole="button"
            accessibilityLabel={other ? `Open ${other.displayName}'s profile` : "Profile"}
          >
            <Avatar uri={other?.photoUrl} name={other?.displayName ?? " "} size={40} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {other?.displayName ?? ""}
                </Text>
                {other?.verified ? <Icon icon={BadgeCheck} size={16} tone="success" /> : null}
              </View>
              <Text variant="caption" tone="muted">
                Match · Tap for profile
              </Text>
            </View>
          </Pressable>
          <IconButton icon={MoreVertical} label="More options" size={40} variant="plain" onPress={() => setMenu(true)} />
        </View>

        {thread.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.colors.gold} />
          </View>
        ) : thread.isError ? (
          <View style={[styles.center, { paddingHorizontal: layout.gutter }]}>
            <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
          </View>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(r) => (r.kind === "msg" ? r.message.id : r.key)}
            renderItem={({ item }) =>
              item.kind === "day" ? (
                <View style={styles.day}>
                  <Text variant="caption" tone="muted" style={[styles.dayText, { backgroundColor: t.colors.glassSoft }]}>
                    {item.label}
                  </Text>
                </View>
              ) : (
                <MessageBubble message={item.message} mine={item.message.senderId === meId} />
              )
            }
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListFooterComponent={
              rows.length === 0 ? (
                <GlassCard padding={16} style={{ marginBottom: 12 }}>
                  <Text variant="bodyStrong">Pehli baat, aaram se 👋</Text>
                  <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
                    Unki profile ki kisi ek baat par sawaal poochhiye. Phone number ya paise ki baat shuru me na karein.
                  </Text>
                </GlassCard>
              ) : null
            }
          />
        )}

        {locked ? (
          <ChatUnlockBar matchId={matchId} bottomInset={insets.bottom} />
        ) : (
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10), borderTopColor: t.colors.divider, backgroundColor: t.colors.tabBar }]}>
            <IconButton icon={Sparkles} label="Ask Grio for a line" size={42} onPress={askGrio} disabled={!other} />
            <View style={[styles.inputWrap, { backgroundColor: t.colors.input, borderColor: t.colors.rim }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Message likhiye…"
                placeholderTextColor={t.colors.textMuted}
                multiline
                maxLength={2000}
                style={[styles.input, { color: t.colors.text, fontFamily: fonts.regular }]}
                accessibilityLabel="Message"
                maxFontSizeMultiplier={1.3}
              />
            </View>
            <Pressable
              onPress={submit}
              disabled={!text.trim() || send.isPending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={[styles.send, { backgroundColor: text.trim() ? t.colors.accent : t.colors.glassSoft }]}
            >
              {send.isPending ? <ActivityIndicator color={t.colors.accentFg} size="small" /> : <Icon icon={SendHorizontal} size={20} color={text.trim() ? t.colors.accentFg : t.colors.textMuted} />}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      <BottomSheet visible={menu} onClose={() => setMenu(false)} title="Options">
        <GlassCard padding={4} level="soft">
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow
              icon={UserRound}
              title="View Profile"
              onPress={() => {
                setMenu(false);
                if (other?.profileId) router.push(`/profile/${other.profileId}`);
              }}
            />
            <ListRow
              icon={Flag}
              title="Report or Block"
              danger
              last
              onPress={() => {
                setMenu(false);
                setReport(true);
              }}
            />
          </View>
        </GlassCard>
      </BottomSheet>
      <ReportSheet visible={report} onClose={() => setReport(false)} target={{ userId: other?.userId }} name={other?.displayName ?? ""} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: layout.gutter, paddingVertical: 12, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  day: { alignItems: "center", marginVertical: 10 },
  dayText: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, overflow: "hidden" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputWrap: { flex: 1, borderRadius: 22, borderWidth: 1, minHeight: 44, maxHeight: 130, justifyContent: "center" },
  input: { fontSize: 16, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 11 : 8, outlineWidth: 0 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
