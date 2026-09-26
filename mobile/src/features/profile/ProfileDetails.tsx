import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  Flag,
  Lock,
  MapPin,
  MessageCircle,
  MoreVertical,
  Orbit,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
import { useState } from "react";
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheet,
  ErrorState,
  GlassCard,
  Icon,
  IconButton,
  ListRow,
  Pill,
  PrimaryButton,
  RoomBackground,
  SecondaryButton,
  Skeleton,
  SmartImage,
  Text,
  toast,
} from "~/components";
import { useOpenGrio } from "~/features/grio/GrioProvider";
import { KundliMilanSheet, type KundliTarget } from "~/features/kundli/KundliMilanSheet";
import { useInterestAction } from "~/features/interests/useInterestAction";
import { ReportSheet } from "~/features/safety/ReportSheet";
import { useProfile, useReel, useToggleShortlist } from "~/hooks/queries";
import { errorMessage } from "~/services/api/client";
import { layout, useTheme } from "~/theme";

/**
 * A profile, as this member may see it. Everything here comes from the web's
 * `getProfileView` — the visibility level (L1 → L2 on interest → L3 on
 * match), the photo gate, and the honest "what opens next" strip — so the
 * app can never show more than the web would.
 *
 * `profileId` "me" is the member's own profile — the preview of how others
 * see them.
 */
export function ProfileDetails({ profileId: id }: { profileId: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const profile = useProfile(id);
  // Today's deck carries the "why this match" lines for this person, when they are in it.
  const reel = useReel(id !== "me");
  const shortlist = useToggleShortlist();
  const { sendInterest, pending } = useInterestAction();
  const [slide, setSlide] = useState(0);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [kundli, setKundli] = useState<KundliTarget | null>(null);
  const openGrio = useOpenGrio();

  const p = profile.data;
  const heroHeight = Math.min(Math.round(height * 0.62), Math.round(width * 1.35));
  const reelCard = reel.data?.cards.find((c) => c.id === id) ?? null;

  if (profile.isPending) {
    return (
      <View style={[styles.root, { backgroundColor: t.colors.background }]}>
        <RoomBackground />
        <Skeleton height={heroHeight} radius={0} />
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton width="60%" height={28} />
          <Skeleton height={120} radius={20} />
          <Skeleton height={120} radius={20} />
        </View>
      </View>
    );
  }

  if (profile.isError || !p) {
    return (
      <View style={[styles.root, { backgroundColor: t.colors.background, paddingTop: insets.top + 60, paddingHorizontal: layout.gutter }]}>
        <RoomBackground />
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
        <SecondaryButton label="Go Back" onPress={() => router.back()} style={{ marginTop: 12 }} />
      </View>
    );
  }

  const photos = p.photoUnlocked
    ? p.slides.length
      ? p.slides.map((s) => ({ id: s.id, url: s.url, focalY: s.focalY }))
      : [{ id: "primary", url: p.photoUrl, focalY: p.photoFocalY }]
    : [{ id: "locked", url: null, focalY: null }];

  const footer = p.isSelf ? (
    <PrimaryButton label="Edit Profile" icon={Pencil} onPress={() => router.push("/me/edit")} />
  ) : p.matchId ? (
    <PrimaryButton label="Message" icon={MessageCircle} onPress={() => router.push(`/chat/${p.matchId}`)} />
  ) : p.interestReceived ? (
    <PrimaryButton label="Respond to Interest" icon={Check} onPress={() => router.navigate("/interests")} />
  ) : p.interestSent ? (
    <SecondaryButton label="Interest Sent" icon={Check} disabled />
  ) : (
    <PrimaryButton label="Send Interest" icon={Send} loading={pending} onPress={() => void sendInterest(p.profileId, p.displayName)} />
  );

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]}>
      <RoomBackground />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={{ height: heroHeight }}>
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(ph) => ph.id}
            onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <SmartImage
                uri={item.url}
                name={p.displayName}
                lock={p.photoUnlocked ? "open" : p.photoLock}
                focalY={item.focalY}
                style={{ width, height: heroHeight }}
                placeholderSize="lg"
                priority="high"
              />
            )}
          />
          <LinearGradient colors={["rgba(12,4,6,0.5)", "rgba(12,4,6,0)"]} style={[styles.topFade, { height: insets.top + 90 }]} pointerEvents="none" />
          <LinearGradient colors={t.gradients.photoFade} locations={[0.3, 0.6, 1]} style={[styles.bottomFade, { height: heroHeight * 0.55 }]} pointerEvents="none" />
          {photos.length > 1 ? (
            <View style={[styles.dots, { top: insets.top + 56 }]} pointerEvents="none">
              {photos.map((ph, i) => (
                <View key={ph.id} style={[styles.dot, { backgroundColor: i === slide ? "#fffdf8" : "rgba(255,255,255,0.35)" }]} />
              ))}
            </View>
          ) : null}
          <View style={[styles.heroBar, { top: insets.top + 6 }]}>
            <IconButton icon={ChevronLeft} label="Back" variant="photo" onPress={() => router.back()} />
            {!p.isSelf ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <IconButton
                  icon={p.shortlisted ? BookmarkCheck : Bookmark}
                  label={p.shortlisted ? "Remove from shortlist" : "Save to shortlist"}
                  variant="photo"
                  active={p.shortlisted}
                  onPress={async () => {
                    if (shortlist.isPending) return;
                    const on = !p.shortlisted;
                    try {
                      // The toast is the server's answer, not the tap's.
                      await shortlist.mutateAsync({ profileId: p.profileId, on });
                      toast.success(on ? "Shortlist me save kiya" : "Shortlist se hataya");
                    } catch (err) {
                      toast.error(errorMessage(err, "Shortlist save nahi hui — dobara try karein."));
                    }
                  }}
                />
                <IconButton icon={MoreVertical} label="More options" variant="photo" onPress={() => setMenu(true)} />
              </View>
            ) : null}
          </View>
          <View style={styles.heroInfo}>
            <View style={styles.nameRow}>
              <Text variant="h1" tone="onPhoto" style={{ flexShrink: 1 }}>
                {p.displayName}
                {p.age ? `, ${p.age}` : ""}
              </Text>
              {p.photoVerified ? <Icon icon={BadgeCheck} size={22} color="#37db96" strokeWidth={2.2} /> : null}
            </View>
            {p.city ? (
              <View style={styles.meta}>
                <Icon icon={MapPin} size={14} color="rgba(255,253,248,0.85)" />
                <Text variant="body" tone="onPhotoMuted">
                  {p.city}
                </Text>
              </View>
            ) : null}
            {p.headline ? (
              <Text variant="body" tone="onPhotoMuted">
                {p.headline}
              </Text>
            ) : null}
            <View style={styles.pills}>
              {p.trustScore != null ? <Pill label={`Trust ${p.trustScore}${p.trustScoreLabel ? ` · ${p.trustScoreLabel}` : ""}`} tone="photo" icon={ShieldCheck} /> : null}
              {p.mobileVerified ? <Pill label="Mobile verified" tone="photo" /> : null}
              <Pill label={p.level === "L3" ? "Full profile" : p.level === "L2" ? "More details open" : "Basic view"} tone="photo" />
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {p.lockedHint ? (
            <GlassCard padding={16} active>
              <View style={styles.row}>
                <Icon icon={Lock} size={18} tone="gold" />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {p.lockedHint.title}
                </Text>
              </View>
              <Text variant="small" tone="secondary" style={{ marginTop: 6 }}>
                {p.lockedHint.description}
              </Text>
            </GlassCard>
          ) : null}

          {reelCard?.whyThisMatch.reasons.length ? (
            <GlassCard padding={16}>
              <Text variant="label" tone="gold">
                Kyun ye rishta aapke liye
              </Text>
              {reelCard.whyThisMatch.reasons.map((r) => (
                <View key={r.text} style={[styles.row, { marginTop: 8 }]}>
                  <Icon icon={r.kind === "ai" ? Sparkles : Check} size={15} tone={r.kind === "ai" ? "gold" : "success"} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {r.text}
                  </Text>
                </View>
              ))}
              {reelCard.whyThisMatch.starter ? (
                <Text variant="small" tone="secondary" style={{ marginTop: 10 }}>
                  Baat shuru karne ke liye: “{reelCard.whyThisMatch.starter}”
                </Text>
              ) : null}
            </GlassCard>
          ) : null}

          {p.bio ? (
            <GlassCard padding={16}>
              <Text variant="label" tone="gold">
                About
              </Text>
              <Text variant="body" style={{ marginTop: 6 }}>
                {p.bio}
              </Text>
            </GlassCard>
          ) : null}

          {p.sections.map((s) => (
            <GlassCard key={s.title} padding={16}>
              <Text variant="label" tone="gold">
                {s.title}
              </Text>
              <View style={{ marginTop: 8 }}>
                {s.rows.map((r, i) => (
                  <View key={`${r.label}-${i}`} style={[styles.fact, i < s.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.divider }]}>
                    <Text variant="small" tone="muted" style={styles.factLabel}>
                      {r.label}
                    </Text>
                    <Text variant="bodyStrong" style={styles.factValue}>
                      {r.value}
                    </Text>
                  </View>
                ))}
              </View>
            </GlassCard>
          ))}

          {p.kundliNotes.length ? (
            <GlassCard padding={16}>
              <Text variant="label" tone="gold">
                Kundli notes
              </Text>
              {p.kundliNotes.map((k) => (
                <View key={k.id} style={{ marginTop: 8 }}>
                  <Text variant="bodyStrong">{k.title}</Text>
                  <Text variant="small" tone="secondary">
                    {k.detail}
                  </Text>
                </View>
              ))}
            </GlassCard>
          ) : null}

          {!p.isSelf ? (
            <GlassCard padding={16} accessibilityLabel="Kundli Milan" onPress={() => setKundli({ profileId: p.profileId, name: p.displayName })}>
              <View style={styles.row}>
                <Icon icon={Orbit} size={20} tone="gold" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">Kundli Milan</Text>
                  <Text variant="small" tone="secondary">
                    36 guna ka paramparik milan — jaankari hai, faisla nahi. Matching par iska koi asar nahi.
                  </Text>
                </View>
              </View>
            </GlassCard>
          ) : null}

          {!p.isSelf ? (
            <GlassCard
              padding={16}
              accessibilityLabel="Ask Grio about this rishta"
              onPress={() => openGrio({ kind: "candidate", profileId: p.profileId, name: p.displayName, source: "page" })}
            >
              <View style={styles.row}>
                <Icon icon={Sparkles} size={20} tone="gold" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">Ask Grio about this rishta</Text>
                  <Text variant="small" tone="secondary">
                    Summary, common baatein, kya missing hai — Grio sirf wahi batata hai jo aapko dikh sakta hai.
                  </Text>
                </View>
              </View>
            </GlassCard>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: t.colors.tabBar, borderTopColor: t.colors.divider }]}>
        <View style={styles.footerColumn}>{footer}</View>
      </View>

      <BottomSheet visible={menu} onClose={() => setMenu(false)} title="Options">
        <GlassCard padding={4} level="soft">
          <View style={{ paddingHorizontal: 12 }}>
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
      <ReportSheet visible={report} onClose={() => setReport(false)} target={{ profileId: p.profileId }} name={p.displayName} />
      <KundliMilanSheet
        target={kundli}
        onClose={() => setKundli(null)}
        // Already on this profile: "Full Profile" just closes the sheet.
        onOpenProfile={() => setKundli(null)}
        onOpenMyKundli={() => {
          setKundli(null);
          router.push("/kundli");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topFade: { position: "absolute", left: 0, right: 0, top: 0 },
  bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  dots: { position: "absolute", left: 16, right: 16, flexDirection: "row", gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2 },
  heroBar: { position: "absolute", left: 12, right: 12, flexDirection: "row", justifyContent: "space-between" },
  heroInfo: { position: "absolute", left: layout.gutter, right: layout.gutter, bottom: 18, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  body: { padding: layout.gutter, gap: 12, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  fact: { flexDirection: "row", paddingVertical: 10, gap: 12 },
  factLabel: { width: "38%" },
  factValue: { flex: 1 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: layout.gutter, borderTopWidth: StyleSheet.hairlineWidth },
  footerColumn: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
});

