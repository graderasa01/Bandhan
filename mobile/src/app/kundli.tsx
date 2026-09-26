import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowRight, CalendarClock, ChevronRight, ExternalLink, FileDown, Flame, Info, Moon, Sparkles, Sunrise, Users } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import {
  BottomSheet,
  ErrorState,
  GhostButton,
  GlassCard,
  Icon,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SecondaryButton,
  Skeleton,
  Text,
  toast,
} from "~/components";
import { KundliChart } from "~/features/kundli/KundliChart";
import { KundliFixForm, useKundliFix, type KundliFix } from "~/features/kundli/KundliFixForm";
import { bandTone, kundliToneColors } from "~/features/kundli/tone";
import { useMyKundli } from "~/hooks/queries";
import { WEB_ORIGIN } from "~/services/config";
import { layout, radius, useTheme } from "~/theme";
import type { KundliChart as Chart, MatchMilanRow } from "~/types/api";

const FIX_CTA: Record<KundliFix, string> = {
  dateOfBirth: "Add Date of Birth",
  birthTime: "Add Birth Time",
  birthPlace: "Fix Birth Place",
};

/**
 * "Meri Kundli" — the member's own chart and guna milan with the people they
 * have already matched with, as `/user/kundli` shows them
 * (`/api/mobile/kundli`: `getOwnChart` + `getMatchMilanList`).
 *
 * Every rung of `chart.precision` keeps its honest state — a lagna is never
 * guessed, a date-only chart is a Chandra Kundli and says so — and every fix
 * is the one missing field, edited right here, never the whole profile. The
 * PDF and the manual tool for somebody else's birth date stay on the website
 * for now (one tap, in the in-app browser).
 */
export default function MyKundli() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const query = useMyKundli();
  const [fix, setFix] = useState<KundliFix | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const form = useKundliFix(fix);

  const openFix = (f: KundliFix) => {
    setFix(f);
    setFixOpen(true);
  };

  async function save() {
    if (!(await form.save())) return;
    setFixOpen(false);
    toast.success("Save ho gaya — kundli dobara ban rahi hai");
    await query.refetch();
  }

  const openWeb = () => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/user/kundli`).catch(() => toast.error("Website nahi khul payi."));

  const data = query.data;
  const chart = data?.chart ?? null;
  const chartSize = Math.min(width - layout.gutter * 2 - 32, 320);

  return (
    <Screen
      header={<ScreenHeader title="Meri Kundli" subtitle="Aapki kundli aur matches ka milan" />}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={t.colors.gold} />}
    >
      {query.isPending ? (
        <View style={styles.stack}>
          <Skeleton height={260} radius={20} />
          <Skeleton height={140} radius={20} />
        </View>
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !chart ? (
        <GlassCard padding={18}>
          <View style={styles.row}>
            <View style={[styles.seal, { backgroundColor: t.colors.accentSoft }]}>
              <Icon icon={CalendarClock} size={19} tone="gold" />
            </View>
            <View style={styles.flex}>
              <Text variant="title">Kundli ke liye pehle Date of Birth chahiye</Text>
              <Text variant="small" tone="secondary">
                Bas date daal dijiye — baaki sab hum khud nikaal lete hain.
              </Text>
            </View>
          </View>
          <PrimaryButton label="Add Date of Birth" iconRight={ArrowRight} onPress={() => openFix("dateOfBirth")} style={styles.cta} />
        </GlassCard>
      ) : (
        <View style={styles.stack}>
          <SummaryCard chart={chart} mangal={data.mangal} chartSize={chartSize} onFix={openFix} />
          <MilanList rows={data.milanRows} viewerNeedsBirthTime={!chart.hasBirthTime} onFix={openFix} />
          <GlassCard padding={16}>
            <View style={styles.row}>
              <Icon icon={data.pdfEntitled ? FileDown : Sparkles} size={18} tone="gold" />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{data.pdfEntitled ? "Kundli PDF aur Turant Kundli" : "Turant Kundli Banayen"}</Text>
                <Text variant="small" tone="secondary">
                  {data.pdfEntitled
                    ? "PDF download aur kisi bhi Date of Birth se kundli — abhi website par."
                    : "Kisi bhi Date of Birth se kundli — abhi website par milti hai."}
                </Text>
              </View>
            </View>
            <SecondaryButton label="Open on Website" icon={ExternalLink} size="md" onPress={openWeb} style={styles.cta} />
          </GlassCard>
        </View>
      )}

      <BottomSheet
        visible={fixOpen}
        onClose={() => setFixOpen(false)}
        title={fix === "dateOfBirth" ? "Apni Date of Birth" : "Janm samay aur sthaan"}
        subtitle="Sirf kundli ke liye — kisi aur ko kabhi nahi dikhta."
        footer={
          <View style={styles.row}>
            <GhostButton label="Cancel" size="md" onPress={() => setFixOpen(false)} disabled={form.saving} />
            <View style={styles.flex}>
              <PrimaryButton label="Save" size="md" loading={form.saving} disabled={!form.canSave} onPress={() => void save()} />
            </View>
          </View>
        }
      >
        {fix ? <KundliFixForm fix={fix} state={form} /> : null}
      </BottomSheet>
    </Screen>
  );
}

/** Chandra first — the one thing every rung states exactly, and what guna milan runs on. */
function SummaryCard({
  chart,
  mangal,
  chartSize,
  onFix,
}: {
  chart: Chart;
  mangal: { status: string; detail: string } | null;
  chartSize: number;
  onFix: (f: KundliFix) => void;
}) {
  const t = useTheme();
  const missing: KundliFix | null = chart.precision === "no-time" ? "birthTime" : chart.precision === "no-place" ? "birthPlace" : null;
  return (
    <GlassCard padding={18}>
      <View style={styles.row}>
        <View style={[styles.seal, { backgroundColor: t.colors.accentSoft }]}>
          <Icon icon={Moon} size={19} tone="gold" />
        </View>
        <View style={styles.flex}>
          <Text variant="label" tone="muted">
            Chandra Rashi
          </Text>
          <Text variant="h1" tone="heading">
            {chart.chandra.rashiName}
          </Text>
          <Text variant="body">
            <Text variant="bodyStrong">{chart.chandra.nakshatraName}</Text>
            <Text variant="body" tone="secondary">
              {` · charan ${chart.chandra.pada} · swami ${chart.chandra.nakshatraLord}`}
            </Text>
          </Text>
        </View>
      </View>

      <View style={[styles.rows, { borderColor: t.colors.divider }]}>
        <View style={styles.line}>
          <Icon icon={Sunrise} size={16} tone="gold" />
          <Text variant="smallStrong" style={styles.lineLabel}>
            Lagna
          </Text>
          <View style={styles.flex}>
            {chart.lagna ? (
              <Text variant="small">
                <Text variant="smallStrong">{chart.lagna.rashiName}</Text>
                <Text variant="small" tone="secondary">{` ${chart.lagna.degreeInRashi.toFixed(0)}°${chart.placeName ? ` · ${chart.placeName}` : ""}`}</Text>
              </Text>
            ) : (
              <>
                <Text variant="small" tone="secondary">
                  {chart.precision === "no-place"
                    ? "Lagna ke liye janm-sthaan chahiye — jo shehar likha hai wo list me nahi mila."
                    : "Lagna ke liye janm samay aur sthaan chahiye."}
                </Text>
                {missing ? (
                  <Pressable onPress={() => onFix(missing)} accessibilityRole="button" style={styles.fix} hitSlop={6}>
                    <Text variant="smallStrong" tone="link">
                      {FIX_CTA[missing]}
                    </Text>
                    <Icon icon={ArrowRight} size={14} tone="link" />
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </View>
        {mangal ? (
          <View style={[styles.line, styles.lineTop, { borderTopColor: t.colors.divider }]}>
            <Icon icon={Flame} size={16} tone="gold" />
            <Text variant="smallStrong" style={styles.lineLabel}>
              Mangal
            </Text>
            <Text variant="small" tone="secondary" style={styles.flex}>
              <Text variant="smallStrong">{mangal.status}</Text>
              {` — ${mangal.detail}`}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.chart}>
        <KundliChart lagnaRashi={chart.lagna?.rashi ?? chart.chandra.rashi} grahas={chart.grahas} size={chartSize} />
        <Text variant="caption" tone="muted" center>
          {chart.lagna
            ? "Janm Kundli · Uttar Bharatiya shaili · ghar ke andar ka number rashi hai"
            : "Chandra Kundli · Chandra pehle ghar me — Lagna abhi nahi bana"}
        </Text>
      </View>

      <View style={[styles.limit, { backgroundColor: t.colors.chip }]}>
        <Icon icon={Info} size={15} tone="muted" />
        <Text variant="small" tone="secondary" style={styles.flex}>
          {chart.precision === "full"
            ? "Janm samay aur sthaan dono se bani hai — phir bhi ye jaankari hai, faisla nahi."
            : chart.precision === "no-place"
              ? "Janm sthaan ke bina Lagna aur grah-bhava nahi bante — ye jaankari hai, faisla nahi."
              : "Janm samay ke bina Lagna aur grah-bhava approximate hain — ye jaankari hai, faisla nahi."}
        </Text>
      </View>
    </GlassCard>
  );
}

/** One row per matched person, one number per row — and none where the jaankari is not there. */
function MilanList({ rows, viewerNeedsBirthTime, onFix }: { rows: MatchMilanRow[]; viewerNeedsBirthTime: boolean; onFix: (f: KundliFix) => void }) {
  const t = useTheme();
  const anyAssumed = rows.some((r) => r.assumedTime);
  return (
    <GlassCard padding={16}>
      <View style={styles.row}>
        <View style={[styles.seal, { backgroundColor: t.colors.accentSoft }]}>
          <Icon icon={Sparkles} size={17} tone="gold" />
        </View>
        <View style={styles.flex}>
          <Text variant="title">Aapke matches ke saath milan</Text>
          <Text variant="small" tone="secondary">
            Sirf un logon ke saath jinse match ho chuka hai — ye jaankari hai, faisla nahi.
          </Text>
        </View>
      </View>
      {rows.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: t.colors.chip }]}>
          <Icon icon={Users} size={18} tone="muted" />
          <Text variant="small" tone="secondary" style={styles.flex}>
            Abhi koi match nahi — match hote hi uska guna milan yahan aa jaayega.
          </Text>
          <GhostButton label="See Matches" size="sm" onPress={() => router.navigate("/interests?tab=matches")} />
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((row, i) => {
            const tone = row.band ? kundliToneColors(t.colors, bandTone(row.band)) : null;
            return (
              <Pressable
                key={row.profileId}
                onPress={() => router.push(`/profile/${row.profileId}`)}
                accessibilityRole="button"
                accessibilityLabel={`${row.name}, ${row.total !== null ? `${row.total} out of 36, ${row.band}` : "no score"}`}
                style={({ pressed }) => [styles.milanRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.divider }, pressed && { opacity: 0.8 }]}
              >
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {row.name}
                  </Text>
                  {row.blocked === "missing-data" ? (
                    <Text variant="caption" tone="muted">
                      Milan ke liye janm-jaankari poori nahi hai — score nahi banaya.
                    </Text>
                  ) : row.assumedTime ? (
                    <Text variant="caption" tone="muted">
                      Birth time ke bina — dopahar maan kar
                    </Text>
                  ) : null}
                </View>
                {row.hasDosha ? (
                  <Text variant="smallStrong" tone="warn">
                    dosh
                  </Text>
                ) : null}
                {row.total !== null && tone ? (
                  <View style={styles.score}>
                    <Text variant="smallStrong">{row.total}/36</Text>
                    <View style={[styles.band, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
                      <Text variant="caption" style={{ color: tone.fg }}>
                        {row.band}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text variant="smallStrong" tone="muted">
                    —/36
                  </Text>
                )}
                <Icon icon={ChevronRight} size={16} tone="muted" />
              </Pressable>
            );
          })}
        </View>
      )}
      {anyAssumed && viewerNeedsBirthTime ? (
        <Pressable onPress={() => onFix("birthTime")} accessibilityRole="button" style={styles.fix} hitSlop={6}>
          <Text variant="smallStrong" tone="link">
            Add Birth Time
          </Text>
          <Icon icon={ArrowRight} size={14} tone="link" />
        </Pressable>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  seal: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cta: { marginTop: 14 },
  rows: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12 },
  lineTop: { borderTopWidth: StyleSheet.hairlineWidth },
  lineLabel: { width: 58 },
  fix: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 },
  chart: { alignItems: "center", gap: 8, marginTop: 16 },
  limit: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14, padding: 12, borderRadius: radius.md },
  empty: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, padding: 12, borderRadius: radius.md, flexWrap: "wrap" },
  list: { marginTop: 8 },
  milanRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 8 },
  score: { flexDirection: "row", alignItems: "center", gap: 6 },
  band: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1 },
});
