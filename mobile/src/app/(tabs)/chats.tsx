import { router } from "expo-router";
import { Lock, MessageCircle } from "lucide-react-native";
import { memo } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, EmptyState, ErrorState, Icon, RoomBackground, Skeleton, Text } from "~/components";
import { useLauncherScroll } from "~/features/grio/launcherScroll";
import { useConversations } from "~/hooks/queries";
import { useSession } from "~/store/session";
import { layout, radius, useTheme } from "~/theme";
import type { Conversation } from "~/types/api";
import { shortTime } from "~/utils/time";

const Row = memo(function Row({ item, meId }: { item: Conversation; meId: string | undefined }) {
  const t = useTheme();
  const unread = item.unreadCount > 0;
  const mine = item.lastMessage?.senderId === meId;
  const preview = item.lastMessage ? `${mine ? "Aap: " : ""}${item.lastMessage.body}` : "Match ho gaya — pehla message bhejiye 👋";
  return (
    <Pressable
      onPress={() => router.push(`/chat/${item.matchId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.other.displayName}${unread ? `, ${item.unreadCount} unread` : ""}. ${preview}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.colors.glassSoft : "transparent", borderBottomColor: t.colors.divider }]}
    >
      <Avatar uri={item.other.photoUrl} name={item.other.displayName} size={54} verified={item.other.verified} ring={unread} />
      <View style={styles.body}>
        <View style={styles.line}>
          <Text variant={unread ? "bodyStrong" : "title"} numberOfLines={1} style={{ flex: 1 }}>
            {item.other.displayName}
          </Text>
          <Text variant="caption" tone={unread ? "gold" : "muted"}>
            {shortTime(item.updatedAt)}
          </Text>
        </View>
        <View style={styles.line}>
          {!item.chatOpen ? <Icon icon={Lock} size={13} tone="muted" /> : null}
          <Text variant="small" tone={unread ? "primary" : "secondary"} numberOfLines={1} style={{ flex: 1 }}>
            {item.chatOpen ? preview : "Chat Unlock se baat shuru hogi"}
          </Text>
          {unread ? (
            <View style={[styles.badge, { backgroundColor: t.colors.accent }]}>
              <Text variant="caption" style={{ color: t.colors.accentFg, fontSize: 10.5 }} maxFontSizeMultiplier={1}>
                {item.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

/** Conversations — only with matches (a chat exists on a Match), newest first, unread marked. */
export default function Chats() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const meId = useSession((s) => s.user?.id);
  const convos = useConversations();
  const onScroll = useLauncherScroll();

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]}>
      <RoomBackground />
      <FlatList
        data={convos.data ?? []}
        keyExtractor={(c) => c.matchId}
        onScroll={onScroll}
        scrollEventThrottle={32}
        renderItem={({ item }) => <Row item={item} meId={meId} />}
        ListHeaderComponent={
          <View style={styles.head}>
            <Text variant="h1">Chats</Text>
            <Text variant="small" tone="secondary">
              Sirf un logon se baat jinse match hua hai — dono ki haan ke baad.
            </Text>
          </View>
        }
        ListEmptyComponent={
          convos.isPending ? (
            <View style={{ gap: 14 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <Skeleton width={54} height={54} radius={27} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width="50%" height={14} />
                    <Skeleton width="80%" height={12} />
                  </View>
                </View>
              ))}
            </View>
          ) : convos.isError ? (
            <ErrorState error={convos.error} onRetry={() => void convos.refetch()} />
          ) : (
            <EmptyState
              icon={MessageCircle}
              title="Abhi koi baat-cheet nahi"
              description="Match hote hi yahan chat khulegi. Reel me pasand ke rishton ko interest bhejiye."
              actionLabel="Open Reels"
              onAction={() => router.navigate("/reels")}
            />
          )
        }
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: layout.tabBarClearance + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={convos.isRefetching} onRefresh={() => void convos.refetch()} tintColor={t.colors.gold} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center", flexGrow: 1 },
  head: { gap: 4, marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm },
  body: { flex: 1, gap: 4 },
  line: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
});
