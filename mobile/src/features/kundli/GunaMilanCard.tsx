import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Info, Sparkles } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GlassCard, Icon, Text } from "~/components";
import { radius, useTheme } from "~/theme";
import type { GunaMilan } from "~/types/api";
import { kundliToneColors } from "./tone";

/**
 * The 36-guna result, as the server computed it — the web's `GunaMilanCard`
 * on the phone, with its three refusals intact:
 *
 *  - no percentage: "24.5 / 36" is the tradition's unit, and 68% would invent
 *    a precision (and invite comparison with the app's own match score);
 *  - no verdict styling: a low total is `caution`, never `danger`;
 *  - the eight kootas are the evidence, one tap away — not the lead.
 *
 * Nothing here is calculated beyond the width of the bar.
 */
export const GunaMilanCard = memo(function GunaMilanCard({
  milan,
  otherName,
  approximate = false,
  viewerAssumed = false,
  onFixBirthTime,
}: {
  milan: GunaMilan;
  otherName?: string;
  /** Either birth time was missing and a Moon came from local noon. */
  approximate?: boolean;
  /** It is the viewer's own birth time that is missing — the only side they may fix. */
  viewerAssumed?: boolean;
  onFixBirthTime?: () => void;
}) {
  const t = useTheme();
  const c = t.colors;
  const [open, setOpen] = useState(false);
  const band = kundliToneColors(c, milan.bandTone);
  const pct = Math.max(0, Math.min(100, (milan.total / 36) * 100));

  return (
    <GlassCard padding={16} flat>
      <View style={styles.head}>
        <View style={[styles.seal, { backgroundColor: c.accentSoft }]}>
          <Icon icon={Sparkles} size={19} tone="gold" />
        </View>
        <View style={styles.flex}>
          <Text variant="title">
            Kundli Milan{otherName ? ` — ${otherName}` : ""}
          </Text>
          <Text variant="small" tone="secondary" style={styles.headLine}>
            {milan.headline} <Text variant="small" tone="muted">Ye jaankari hai, faisla nahi.</Text>
          </Text>
        </View>
      </View>

      <View style={styles.totalRow} accessible accessibilityLabel={`Guna milan ${milan.total} out of 36, ${milan.band}`}>
        <Text variant="display" tone="heading">
          {milan.total}
        </Text>
        <Text variant="h3" tone="muted">
          / 36
        </Text>
        <View style={[styles.band, { backgroundColor: band.bg, borderColor: band.fg }]}>
          <Text variant="smallStrong" style={{ color: band.fg }}>
            {milan.band}
          </Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: c.chip }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: band.fg }]} />
      </View>

      {/* By role, not "aap"/"unka": three kootas are asymmetric, and the viewer may be either. */}
      <View style={styles.moons}>
        {[
          { label: "Ladke ka Chandra", side: milan.boy },
          { label: "Ladki ka Chandra", side: milan.girl },
        ].map((m) => (
          <View key={m.label} style={[styles.moon, { backgroundColor: c.chip }]}>
            <Text variant="caption" tone="muted">
              {m.label}
            </Text>
            <Text variant="smallStrong">
              {m.side.rashiName} · {m.side.nakshatraName}
            </Text>
          </View>
        ))}
      </View>

      {milan.dosha.map((d) => (
        <View key={d.key} style={[styles.box, { backgroundColor: c.warnBg, borderColor: c.warn }]}>
          <Icon icon={AlertTriangle} size={15} color={c.warn} />
          <View style={styles.flex}>
            <Text variant="smallStrong" tone="warn">
              {d.title}
            </Text>
            <Text variant="small" tone="secondary">
              {d.detail}
            </Text>
          </View>
        </View>
      ))}

      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.toggle}
        hitSlop={4}
      >
        <Text variant="smallStrong" tone="link">
          Aath koot ka hisaab
        </Text>
        <Icon icon={open ? ChevronUp : ChevronDown} size={17} tone="link" />
      </Pressable>

      {open ? (
        <View style={[styles.kootas, { borderTopColor: c.divider }]}>
          {milan.kootas.map((k) => {
            const tone = kundliToneColors(c, k.tone);
            return (
              <View key={k.key} style={styles.koota}>
                <View style={styles.kootaHead}>
                  <Text variant="smallStrong">{k.label}</Text>
                  <View style={[styles.score, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
                    <Text variant="caption" style={{ color: tone.fg }}>
                      {k.score}/{k.max}
                    </Text>
                  </View>
                  <Text variant="caption" tone="muted" numberOfLines={1} style={styles.values}>
                    {k.boyValue} · {k.girlValue}
                  </Text>
                </View>
                <Text variant="small" tone="secondary">
                  {k.meaning}
                </Text>
                <Text variant="small" tone="muted">
                  {k.verdict}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {approximate ? (
        <View style={[styles.box, styles.column, { backgroundColor: c.infoBg, borderColor: c.info }]}>
          <Text variant="small" tone="secondary">
            {viewerAssumed
              ? "Aapka birth time nahi bhara hai, isliye Chandra dopahar ke hisaab se liya gaya — nakshatra badal sakta hai."
              : "Kisi ek ka birth time nahi bhara hai, isliye Chandra dopahar ke hisaab se liya gaya — nakshatra badal sakta hai."}
          </Text>
          {viewerAssumed && onFixBirthTime ? (
            <Pressable onPress={onFixBirthTime} accessibilityRole="button" style={styles.fix} hitSlop={6}>
              <Text variant="smallStrong" tone="link">
                Add Birth Time
              </Text>
              <Icon icon={ArrowRight} size={15} tone="link" />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.foot, { borderTopColor: c.divider }]}>
        <Icon icon={Info} size={14} tone="muted" />
        <Text variant="caption" tone="muted" style={styles.flex}>
          Ganit asli graha-sthiti (Lahiri ayanamsa) se hai — par guna parampara ka ek paimana bhar hai. Ye kisi rishte ka faisla nahi karta, aur
          BandhanTak ki matching par iska koi asar nahi.
        </Text>
      </View>
    </GlassCard>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  seal: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headLine: { marginTop: 2 },
  totalRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 14 },
  band: { marginLeft: "auto", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, alignSelf: "center" },
  track: { height: 8, borderRadius: 4, overflow: "hidden", marginTop: 8 },
  fill: { height: "100%", borderRadius: 4 },
  moons: { flexDirection: "row", gap: 8, marginTop: 10 },
  moon: { flex: 1, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.sm, gap: 2 },
  box: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  column: { flexDirection: "column", gap: 4 },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 46, marginTop: 6 },
  kootas: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  koota: { gap: 2 },
  kootaHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  score: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, borderWidth: 1 },
  values: { marginLeft: "auto", flexShrink: 1 },
  fix: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 },
  foot: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
