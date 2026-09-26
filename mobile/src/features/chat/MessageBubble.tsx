import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { LinearGradient } from "expo-linear-gradient";
import { CheckCheck, Check, Mic, Pause, Play } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "~/components";
import { authHeaders, resolveMediaUrl } from "~/services/api/client";
import { radius, useTheme } from "~/theme";
import type { ChatMessage } from "~/types/api";
import { clockTime } from "~/utils/time";

function VoicePlayer({ url, durationMs, mine }: { url: string; durationMs: number; mine: boolean }) {
  const t = useTheme();
  // Gated audio: the session header travels with the request, never in the URL.
  const player = useAudioPlayer({ uri: resolveMediaUrl(url) ?? url, headers: authHeaders() });
  const status = useAudioPlayerStatus(player);
  const color = mine ? t.colors.accentFg : t.colors.text;
  return (
    <Pressable
      onPress={() => (status.playing ? player.pause() : player.play())}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? "Pause voice message" : "Play voice message"}
      style={styles.voice}
    >
      <Icon icon={status.playing ? Pause : Play} size={20} color={color} />
      <Icon icon={Mic} size={14} color={color} />
      <Text variant="small" style={{ color }}>
        Voice message · {Math.max(1, Math.round(durationMs / 1000))}s
      </Text>
    </Pressable>
  );
}

/** One message: the member's own on the right in the room's accent, theirs on the left in glass. */
export const MessageBubble = memo(function MessageBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const t = useTheme();
  const time = clockTime(message.createdAt);
  const content = message.voice ? (
    <VoicePlayer url={message.voice.url} durationMs={message.voice.durationMs} mine={mine} />
  ) : message.voice === null ? (
    <Text variant="small" style={{ color: mine ? t.colors.accentFg : t.colors.textMuted, fontStyle: "italic" }}>
      Voice message hata diya gaya
    </Text>
  ) : (
    <Text variant="body" style={{ color: mine ? t.colors.accentFg : t.colors.text }}>
      {message.body}
    </Text>
  );

  return (
    <View style={[styles.wrap, mine ? styles.right : styles.left]}>
      <View style={[styles.bubble, mine ? styles.mine : [styles.theirs, { backgroundColor: t.colors.glassStrong, borderColor: t.colors.rim }]]}>
        {mine ? <LinearGradient colors={t.gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]} /> : null}
        {content}
        <View style={styles.meta}>
          <Text variant="caption" style={{ color: mine ? "rgba(255,245,242,0.75)" : t.colors.textMuted, fontSize: 10.5 }} maxFontSizeMultiplier={1.1}>
            {time}
          </Text>
          {mine ? <Icon icon={message.readAt ? CheckCheck : Check} size={13} color={message.readAt ? "#ffe487" : "rgba(255,245,242,0.75)"} /> : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginVertical: 3, maxWidth: "82%" },
  left: { alignSelf: "flex-start" },
  right: { alignSelf: "flex-end" },
  bubble: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 6, borderRadius: radius.lg, overflow: "hidden" },
  mine: { borderBottomRightRadius: 6 },
  theirs: { borderBottomLeftRadius: 6, borderWidth: 1 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 3 },
  voice: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
});
