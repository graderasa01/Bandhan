import { Camera, ImagePlus, Star, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import { BottomSheet, GlassCard, Icon, ListRow, Pill, SmartImage, Text, toast } from "~/components";
import { useDeletePhoto, useMakePrimary, useUploadPhoto } from "~/hooks/queries";
import { useResponsive } from "~/hooks/useResponsive";
import { errorMessage } from "~/services/api/client";
import { pickPhoto } from "~/services/media";
import { radius, useTheme } from "~/theme";
import type { MyPhoto } from "~/types/api";

const MAX_PHOTOS = 6;

const STATUS: Record<MyPhoto["verificationStatus"], { label: string; tone: "success" | "info" | "danger" }> = {
  APPROVED: { label: "Approved", tone: "success" },
  PENDING: { label: "In review", tone: "info" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

/**
 * Up to six photos (the server's limit), compressed on the phone before
 * upload, with the review status the server reports. The first approved photo
 * is what others see; "Make main" picks a different one.
 */
export function PhotoManager({ photos, name }: { photos: MyPhoto[]; name: string }) {
  const t = useTheme();
  const { column } = useResponsive();
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const primary = useMakePrimary();
  const [chooser, setChooser] = useState(false);
  const [selected, setSelected] = useState<MyPhoto | null>(null);
  const tile = Math.floor((column - 32 - 2 * 10) / 3);

  async function add(source: "library" | "camera") {
    setChooser(false);
    const picked = await pickPhoto(source);
    if (!picked.ok) {
      if (picked.reason === "denied") toast.error(source === "camera" ? "Camera ki permission chahiye." : "Gallery ki permission chahiye.");
      if (picked.reason === "failed") toast.error("Photo khul nahi paayi — dobara try karein.");
      return;
    }
    try {
      const res = await upload.mutateAsync({ uri: picked.image.uri, mimeType: picked.image.mimeType });
      toast.success(res.verificationStatus === "PENDING" ? "Photo upload ho gayi — review ke baad dikhegi." : "Photo lag gayi!");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function confirmDelete(photo: MyPhoto) {
    setSelected(null);
    const run = async () => {
      try {
        await remove.mutateAsync(photo.id);
        toast.success("Photo hata di");
      } catch (err) {
        toast.error(errorMessage(err));
      }
    };
    if (Platform.OS === "web") {
      void run();
      return;
    }
    Alert.alert("Photo hatayein?", "Ye photo aapki profile se hat jayegi.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.grid}>
        {photos.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setSelected(p)}
            accessibilityRole="button"
            accessibilityLabel={`Photo${p.isPrimary ? ", main photo" : ""}, ${STATUS[p.verificationStatus].label}`}
            style={[styles.tile, { width: tile, height: tile * 1.25, borderColor: p.isPrimary ? t.colors.gold : t.colors.rim }]}
          >
            <SmartImage uri={p.fileUrl} name={name} style={StyleSheet.absoluteFill} focalY={p.focalY} placeholderSize="sm" />
            <View style={styles.tileTop}>
              {p.isPrimary ? <Pill label="Main" tone="gold" icon={Star} /> : <View />}
            </View>
            <View style={styles.tileBottom}>
              <Pill label={STATUS[p.verificationStatus].label} tone={STATUS[p.verificationStatus].tone} />
            </View>
          </Pressable>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <Pressable
            onPress={() => setChooser(true)}
            disabled={upload.isPending}
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            style={[styles.tile, styles.add, { width: tile, height: tile * 1.25, borderColor: t.colors.rim, backgroundColor: t.colors.glassSoft }]}
          >
            {upload.isPending ? (
              <ActivityIndicator color={t.colors.gold} />
            ) : (
              <>
                <Icon icon={ImagePlus} size={26} tone="gold" />
                <Text variant="caption" tone="secondary">
                  Add Photo
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      <GlassCard level="soft" padding={14}>
        <Text variant="smallStrong" tone="gold">
          Achhi photo ke 3 niyam
        </Text>
        <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
          Saaf chehra aur achhi roshni · Sirf aap, group photo nahi · Filter kam se kam. Photo pehle review hoti hai, phir sabko dikhti hai.
        </Text>
      </GlassCard>

      <BottomSheet visible={chooser} onClose={() => setChooser(false)} title="Photo add karein">
        <GlassCard padding={4} level="soft">
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow icon={Camera} title="Take a photo" subtitle="Camera se abhi kheenchiye" onPress={() => void add("camera")} />
            <ListRow icon={ImagePlus} title="Choose from gallery" subtitle="Phone ki photos se chuniye" onPress={() => void add("library")} last />
          </View>
        </GlassCard>
      </BottomSheet>

      <BottomSheet visible={selected !== null} onClose={() => setSelected(null)} title="Photo">
        {selected ? (
          <GlassCard padding={4} level="soft">
            <View style={{ paddingHorizontal: 12 }}>
              {!selected.isPrimary ? (
                <ListRow
                  icon={Star}
                  title="Make main photo"
                  subtitle="Sabse pehle yahi dikhegi"
                  onPress={async () => {
                    const id = selected.id;
                    setSelected(null);
                    try {
                      await primary.mutateAsync(id);
                      toast.success("Main photo badal di");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                />
              ) : null}
              <ListRow icon={Trash2} title="Delete photo" danger onPress={() => confirmDelete(selected)} last />
            </View>
          </GlassCard>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { borderRadius: radius.md, overflow: "hidden", borderWidth: 1.2 },
  tileTop: { position: "absolute", top: 6, left: 6, right: 6, flexDirection: "row" },
  tileBottom: { position: "absolute", bottom: 6, left: 6 },
  add: { alignItems: "center", justifyContent: "center", gap: 6, borderStyle: "dashed" },
});
