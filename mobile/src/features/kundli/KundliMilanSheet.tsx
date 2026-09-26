import { ArrowRight, CalendarClock, Orbit, UserRound } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { BottomSheet, GhostButton, Icon, PrimaryButton, SecondaryButton, Text, toast } from "~/components";
import { useKundliMilan } from "~/hooks/queries";
import { errorMessage } from "~/services/api/client";
import { radius, useTheme } from "~/theme";
import { firstNameOf } from "~/utils/names";
import { GunaMilanCard } from "./GunaMilanCard";
import { KundliFixForm, useKundliFix, type KundliFix } from "./KundliFixForm";
import { KundliNotes } from "./KundliNotes";

export interface KundliTarget {
  profileId: string;
  name: string;
}

/**
 * Kundli Milan for the person on the reel, without leaving it — the web's
 * `ReelKundliSheet`, on `GET /api/kundli/milan/:profileId` (the same
 * `getKundliMatchView` the profile page renders, fetched only on tap).
 *
 * Every "can't compute" state is a prompt, not an error, and only the
 * *viewer's* missing birth details are ever offered as a fix: the other
 * person's are theirs to fill. A fix happens here, in the sheet — the one
 * field asked for (date, or time with place), saved through the ordinary
 * autosave — and the milan is fetched again, so the member is back on the same
 * card with the new answer, never sent to a generic form.
 *
 * Milan is information about a profile the member opened; it changes nothing
 * about who the reel shows.
 */
export function KundliMilanSheet({
  target,
  onClose,
  onOpenProfile,
  onOpenMyKundli,
}: {
  /** Null while closed. */
  target: KundliTarget | null;
  onClose: () => void;
  onOpenProfile: (profileId: string) => void;
  onOpenMyKundli: () => void;
}) {
  const t = useTheme();
  // The sheet keeps its last person while it slides away.
  const [shown, setShown] = useState<KundliTarget | null>(target);
  const [fix, setFix] = useState<KundliFix | null>(null);
  if (target && (target.profileId !== shown?.profileId || target.name !== shown?.name)) {
    if (target.profileId !== shown?.profileId) setFix(null);
    setShown(target);
  }
  const visible = target !== null;
  const query = useKundliMilan(shown?.profileId ?? null, visible);
  const form = useKundliFix(fix);
  const [refreshing, setRefreshing] = useState(false);

  const name = query.data?.name ?? shown?.name ?? "";
  const first = firstNameOf(name);

  async function save() {
    const saved = await form.save();
    if (!saved) return;
    toast.success("Save ho gaya — milan dobara nikal rahe hain");
    setFix(null);
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const loading = query.isPending || refreshing;
  const data = query.data;
  const view = data?.ok ? data.view : undefined;

  let body: React.ReactNode;
  if (fix) {
    body = <KundliFixForm fix={fix} state={form} />;
  } else if (loading) {
    body = (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator color={t.colors.gold} />
        <Text variant="small" tone="secondary">
          Guna milan nikal rahe hain…
        </Text>
      </View>
    );
  } else if (query.isError) {
    body = (
      <View style={styles.center}>
        <Text variant="body" tone="secondary" center>
          {errorMessage(query.error, "Kundli milan abhi load nahi hua.")}
        </Text>
        <SecondaryButton label="Try Again" size="md" fullWidth={false} onPress={() => void query.refetch()} />
      </View>
    );
  } else if (!data?.ok || !view) {
    body = (
      <Text variant="body" tone="secondary" center style={styles.pad}>
        {data?.message ?? "Abhi kundli milan nahi dikh sakta."}
      </Text>
    );
  } else {
    body = (
      <View style={styles.stack}>
        {view.milan ? (
          <GunaMilanCard
            milan={view.milan}
            otherName={first}
            approximate={Boolean(data.approximate)}
            viewerAssumed={Boolean(data.viewerAssumed)}
            onFixBirthTime={() => setFix("birthTime")}
          />
        ) : view.milanBlockedReason === "viewer-missing-dob" ? (
          <Pressable
            onPress={() => setFix("dateOfBirth")}
            accessibilityRole="button"
            style={({ pressed }) => [styles.ask, { borderColor: t.colors.gold, backgroundColor: t.colors.chip, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={[styles.askIcon, { backgroundColor: t.colors.accentSoft }]}>
              <Icon icon={CalendarClock} size={18} tone="gold" />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">Apni Date of Birth bhariye</Text>
              <Text variant="small" tone="secondary">
                Bharte hi har profile ka 36 guna milan apne aap ban jayega.
              </Text>
            </View>
            <Icon icon={ArrowRight} size={17} tone="muted" />
          </Pressable>
        ) : (
          <View style={[styles.note, { backgroundColor: t.colors.chip, borderColor: t.colors.hairline }]}>
            <Text variant="small" tone="secondary">
              {view.milanBlockedReason === "candidate-missing-dob"
                ? `${first} ne abhi apni janm tithi nahi bhari hai, isliye guna milan nahi ban sakta. Unki jaankari sirf wahi bhar sakte hain.`
                : "Is jodi ke liye guna milan ka paramparik hisaab lagu nahi hota."}
            </Text>
          </View>
        )}
        <KundliNotes notes={view.notes} />
      </View>
    );
  }

  const footer = fix ? (
    <View style={styles.row}>
      <GhostButton label="Back" size="md" onPress={() => setFix(null)} disabled={form.saving} />
      <View style={styles.flex}>
        <PrimaryButton label="Save" size="md" loading={form.saving} disabled={!form.canSave} onPress={() => void save()} />
      </View>
    </View>
  ) : (
    <View style={styles.row}>
      <View style={styles.flex}>
        <SecondaryButton label="Full Profile" icon={UserRound} size="md" onPress={() => shown && onOpenProfile(shown.profileId)} />
      </View>
      <View style={styles.flex}>
        <PrimaryButton label="My Kundli" icon={Orbit} size="md" haptic={false} onPress={onOpenMyKundli} />
      </View>
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={fix === "dateOfBirth" ? "Apni Date of Birth" : fix ? "Janm samay aur sthaan" : "Kundli Milan"}
      subtitle={
        fix
          ? "Sirf kundli ke liye — kisi aur ko kabhi nahi dikhta."
          : "Parampara ka ek paimana — rishta ka faisla nahi, aur matching me iska koi hissa nahi."
      }
      footer={footer}
    >
      {body}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 14 },
  center: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 32 },
  pad: { paddingVertical: 24 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  ask: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1 },
  askIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  note: { padding: 14, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
