import { router } from "expo-router";
import { Camera, Eye, FileText, Pencil, Settings, ShieldCheck, Sparkles, UserRoundCog } from "lucide-react-native";
import { RefreshControl, StyleSheet, View } from "react-native";
import {
  Avatar,
  ErrorState,
  GlassCard,
  ListRow,
  Pill,
  PrimaryButton,
  ProgressRing,
  Screen,
  ScreenHeader,
  SecondaryButton,
  Skeleton,
  Text,
} from "~/components";
import { useMyProfile } from "~/hooks/queries";
import { useSession } from "~/store/session";
import { useTheme } from "~/theme";

/**
 * My Profile — who I am and how ready I look, one calm screen (the web's
 * "Me & Trust" hub): the profile at a glance, then everything about it —
 * photos, biodata, visibility, AI help — and Settings.
 */
export default function MyProfile() {
  const t = useTheme();
  const me = useMyProfile();
  const user = useSession((s) => s.user);
  const v = me.data?.values ?? {};
  const name = v.fullName ?? user?.full_name ?? "";
  const primary = me.data?.photos.find((p) => p.isPrimary) ?? me.data?.photos[0];

  return (
    <Screen
      header={<ScreenHeader title="My Profile" right={<SecondaryButton label="Settings" icon={Settings} size="sm" fullWidth={false} onPress={() => router.push("/settings")} />} />}
      refreshControl={<RefreshControl refreshing={me.isRefetching} onRefresh={() => void me.refetch()} tintColor={t.colors.gold} />}
    >
      {me.isPending ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={190} radius={20} />
          <Skeleton height={260} radius={20} />
        </View>
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : (
        <View style={{ gap: 16 }}>
          <GlassCard padding={18}>
            <View style={styles.hero}>
              <Avatar uri={primary?.fileUrl} name={name || "Aap"} size={78} ring verified={primary?.verificationStatus === "APPROVED"} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="h2" numberOfLines={1}>
                  {name || "Aapki profile"}
                </Text>
                <Text variant="small" tone="secondary" numberOfLines={2}>
                  {[v.currentCity, v.education, v.profession].filter(Boolean).join(" · ") || "Profile details abhi bharni hain"}
                </Text>
                <Pill label={me.data.isLive ? "Profile live" : "Not live yet"} tone={me.data.isLive ? "success" : "gold"} />
              </View>
              <ProgressRing percent={me.data.completionPercent} size={62} label="Profile completion" />
            </View>
            <View style={styles.actions}>
              <SecondaryButton label="View Profile" icon={Eye} size="sm" fullWidth={false} style={styles.flex} onPress={() => router.push("/me/preview")} />
              <PrimaryButton label="Edit Profile" icon={Pencil} size="sm" fullWidth={false} style={styles.flex} onPress={() => router.push("/me/edit")} />
            </View>
          </GlassCard>

          {!me.data.isLive ? (
            <GlassCard active padding={16} onPress={() => router.push("/setup")}>
              <Text variant="bodyStrong">Profile live karne ke liye {me.data.readiness.total - me.data.readiness.done} baatein baaki</Text>
              <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
                {me.data.readiness.blockers.map((b) => b.label).join(" · ")}
              </Text>
            </GlassCard>
          ) : null}

          <GlassCard padding={4}>
            <View style={{ paddingHorizontal: 12 }}>
              <ListRow icon={Camera} title="Photos" subtitle={`${me.data.photos.length}/6 photos`} onPress={() => router.push("/me/photos")} />
              <ListRow icon={FileText} title="Biodata" subtitle="Family ke saath share karne layak PDF" onPress={() => router.push("/me/biodata")} />
              <ListRow icon={ShieldCheck} title="Profile Visibility" subtitle="Photo privacy, incognito, search consent" onPress={() => router.push("/me/visibility")} />
              <ListRow icon={UserRoundCog} title="Profile Completion" subtitle={`${me.data.completionPercent}% complete`} onPress={() => router.push("/setup")} />
              <ListRow icon={Sparkles} title="Improve with AI" subtitle="Grio batayega kya missing hai" onPress={() => router.push("/assistant/improve")} last />
            </View>
          </GlassCard>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 14 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  flex: { flex: 1 },
});
