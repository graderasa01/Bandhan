import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { LucideIcon } from "lucide-react-native";
import { Bell, BellRing, Gift, Heart, Lock, Megaphone, MessageCircleQuestion, Mic, ShieldCheck, Users } from "lucide-react-native";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { EmptyState, ErrorState, GhostButton, Icon, Screen, ScreenHeader, Skeleton, Text } from "~/components";
import { useMarkAllNoticesRead, useMarkNoticeRead, useNotices } from "~/hooks/queries";
import { WEB_ORIGIN } from "~/services/config";
import { layout, radius, useTheme } from "~/theme";
import type { Notice } from "~/types/api";
import { shortTime } from "~/utils/time";
import { appTargetFor } from "~/utils/webRoutes";

const KIND_ICON: Record<string, LucideIcon> = {
  MATCH_CREATED: Heart,
  VOICE_NOTE_RECEIVED: Mic,
  QUESTION_ASKED: MessageCircleQuestion,
  QUESTION_ANSWERED: MessageCircleQuestion,
  FAMILY_ACTION: Users,
  PLAN_GRANTED: Gift,
  REWARD_EARNED: Gift,
  ANNOUNCEMENT: Megaphone,
  VERIFICATION_UPDATE: ShieldCheck,
  CHAT_NUDGE: BellRing,
};

/**
 * The inbox — every notice `createNotice()` writes on the server (the same
 * rows the web inbox and web push read). Titles never name who acted when the
 * notice is masked; opening one goes to the matching screen in the app, or to
 * the website for places the app does not have yet.
 */
export default function Notifications() {
  const t = useTheme();
  const notices = useNotices();
  const markRead = useMarkNoticeRead();
  const markAll = useMarkAllNoticesRead();
  const unread = notices.data?.unreadCount ?? 0;

  const open = (n: Notice) => {
    if (!n.read) markRead.mutate(n.id);
    const target = appTargetFor(n.href);
    if (!target) return;
    if (target.kind === "app") router.push(target.route);
    else void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}${target.path}`);
  };

  return (
    <Screen
      scroll={false}
      padded={false}
      header={
        <ScreenHeader
          title="Notifications"
          right={unread ? <GhostButton label="Mark all read" size="sm" onPress={() => markAll.mutate()} /> : undefined}
        />
      }
    >
      <FlatList
        data={notices.data?.notices ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={notices.isRefetching} onRefresh={() => void notices.refetch()} tintColor={t.colors.gold} />}
        renderItem={({ item }) => {
          const icon = KIND_ICON[item.kind] ?? Bell;
          return (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.read ? "" : "Unread. "}${item.title}. ${item.body}`}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: item.read ? "transparent" : t.colors.glassSoft,
                  borderColor: item.read ? t.colors.divider : t.colors.rim,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <View style={[styles.seal, { backgroundColor: t.colors.accentSoft }]}>
                <Icon icon={icon} size={19} tone="gold" />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.titleRow}>
                  <Text variant={item.read ? "title" : "bodyStrong"} numberOfLines={1} style={{ flex: 1 }}>
                    {item.title}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {shortTime(item.createdAt)}
                  </Text>
                </View>
                <Text variant="small" tone="secondary" numberOfLines={3}>
                  {item.body}
                </Text>
                {item.actorMasked ? (
                  <View style={styles.masked}>
                    <Icon icon={Lock} size={12} tone="muted" />
                    <Text variant="caption" tone="muted">
                      Naam jawab dene par dikhega
                    </Text>
                  </View>
                ) : null}
              </View>
              {!item.read ? <View style={[styles.dot, { backgroundColor: t.colors.gold }]} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          notices.isPending ? (
            <View style={{ gap: 12 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={78} radius={16} />
              ))}
            </View>
          ) : notices.isError ? (
            <ErrorState error={notices.error} onRetry={() => void notices.refetch()} />
          ) : (
            <EmptyState icon={Bell} title="Sab padh liya" description="Naye interests, matches aur messages ki khabar yahan aayegi." />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: layout.gutter, gap: 10, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center", paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1 },
  seal: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  masked: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
