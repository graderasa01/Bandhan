import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Check, RefreshCw } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { GlassCard, Icon, Screen, ScreenHeader, SecondaryButton, Text, toast } from "~/components";
import { resolveMediaUrl } from "~/services/api/client";
import { ROOMS, radius, useThemeRoom, type RoomId } from "~/theme";
import type { ThemeRoomConfig } from "~/types/api";
import { haptics } from "~/utils/haptics";

const BLURB: Record<RoomId, string> = {
  terrace: "Champagne satin aur wine — BandhanTak ka apna look",
  ivory: "Graphite aur plum — shaant, gehra",
  gold: "Deepak ki roshni — raat ke liye",
  paper: "Cream kagaz, wine syahi — sabse saaf aur halka",
};

/**
 * The look — the same four rooms as the website's theme button, limited to
 * the ones the admin keeps on. The admin's photo and glass for a room come
 * with it automatically; the app never edits them. A room with the admin's
 * photo shows that photo as its swatch — what it will actually look like.
 *
 * "Refresh Theme" asks the server now instead of waiting for the next launch
 * or foreground: an admin change reaches the phone within a minute or so
 * (the server keeps its answer for half a minute).
 */
export default function Appearance() {
  const { roomId, enabledRooms, roomBackgrounds, setRoom, refresh, refreshing } = useThemeRoom();

  const onRefresh = async () => {
    haptics.select();
    const fromServer = await refresh();
    if (fromServer) toast.success("Admin ka latest look laga diya.");
    else toast.error("Server tak nahi pahunch paaye — pichla look hi chal raha hai.");
  };

  return (
    <Screen header={<ScreenHeader title="Appearance" />}>
      <View style={{ gap: 12 }}>
        <Text variant="body" tone="secondary">
          App ka rang-roop chuniye. Padhne me jo aasaan lage, wahi sahi.
        </Text>
        {enabledRooms.map((id) => {
          const room = ROOMS[id];
          const active = id === roomId;
          const photo = roomBackgrounds[id];
          return (
            <Pressable
              key={id}
              onPress={() => {
                haptics.select();
                setRoom(id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${room.label} theme`}
            >
              <GlassCard padding={12} active={active}>
                <View style={styles.row}>
                  {photo ? (
                    <PhotoSwatch photo={photo} />
                  ) : (
                    <LinearGradient colors={room.gradients.room} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch}>
                      <View style={[styles.chip, { backgroundColor: room.colors.accent }]} />
                      <View style={[styles.line, { backgroundColor: room.colors.text }]} />
                    </LinearGradient>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{room.label}</Text>
                    <Text variant="small" tone="secondary">
                      {photo ? "Admin ki photo ke saath, saaf glass" : BLURB[id]}
                    </Text>
                  </View>
                  {active ? <Icon icon={Check} size={20} tone="gold" /> : null}
                </View>
              </GlassCard>
            </Pressable>
          );
        })}

        <GlassCard padding={14} level="soft">
          <View style={{ gap: 10 }}>
            <Text variant="small" tone="secondary">
              Rang, photo aur glass admin tay karta hai. Abhi badla ho to yahan se turant laaiye.
            </Text>
            <SecondaryButton label="Refresh Theme" icon={RefreshCw} size="sm" loading={refreshing} onPress={() => void onRefresh()} />
          </View>
        </GlassCard>
      </View>
    </Screen>
  );
}

/** The admin's photo as the room's swatch: its blurred copy first, the photo over it, the admin's dim on top. */
function PhotoSwatch({ photo }: { photo: NonNullable<ThemeRoomConfig["background"]> }) {
  const uri = resolveMediaUrl(photo.imageUrl);
  const backdrop = resolveMediaUrl(photo.backdropUrl);
  return (
    <View style={[styles.swatch, styles.photoSwatch, { backgroundColor: photo.color }]}>
      {uri ? (
        <Image
          source={{ uri }}
          placeholder={backdrop ? { uri: backdrop } : undefined}
          placeholderContentFit="cover"
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={{ left: `${photo.focusX}%`, top: `${photo.focusY}%` }}
          cachePolicy="memory-disk"
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(20,10,12,${Math.min(0.9, Math.max(0, photo.dim))})` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  swatch: { width: 64, height: 64, borderRadius: radius.md, padding: 10, justifyContent: "flex-end", gap: 6 },
  photoSwatch: { overflow: "hidden", padding: 0 },
  chip: { width: 28, height: 10, borderRadius: 5 },
  line: { width: 40, height: 4, borderRadius: 2, opacity: 0.8 },
});
