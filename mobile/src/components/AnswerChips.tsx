import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";
import { Appear } from "./Appear";
import { GlassSurface } from "./GlassSurface";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export interface AnswerChipView {
  id: string;
  label: string;
  /** Undefined for a chip that stores nothing ("+ Doosra shehar", "Abhi nahi"). */
  selected?: boolean;
}

/**
 * The answers that can simply be tapped for a question (the web's
 * `AnswerChips`) — Bolo's conversation and the reel's feed questions both ask
 * with these: 41px pills with a 15px gutter — separate answers, not a
 * segmented control — and the chosen one in the room's filled accent with a
 * lit rim. Every one could also be said or typed; these are only a shortcut.
 * Each keeps a 48px hit area however small it looks. `busyId` shows the one
 * being saved right now.
 */
export const AnswerChips = memo(function AnswerChips({
  chips,
  label,
  disabled,
  busyId,
  onPick,
}: {
  chips: AnswerChipView[];
  /** The question these answer — the group's accessible name. */
  label: string;
  disabled?: boolean;
  busyId?: string | null;
  onPick: (id: string) => void;
}) {
  const t = useTheme();
  if (chips.length === 0) return null;
  return (
    <View style={styles.wrap} accessibilityLabel={label}>
      {chips.map((chip, index) => {
        const selected = chip.selected === true;
        const busy = busyId === chip.id;
        return (
          <Appear key={chip.id} from="right" distance={20} delay={50 + index * 35} duration={260}>
            <PressableScale
              disabled={disabled}
              onPress={() => {
                haptics.select();
                onPick(chip.id);
              }}
              accessibilityRole={chip.selected === undefined ? "button" : "radio"}
              accessibilityState={{ selected, disabled: !!disabled, busy }}
              accessibilityLabel={chip.label}
              hitSlop={4}
              scaleTo={0.96}
              style={styles.hit}
            >
              {selected ? (
                <View style={[styles.chip, styles.selected, { borderColor: t.material.kind === "paper" ? t.colors.chipSelected : "rgba(255,226,226,0.7)" }]}>
                  <LinearGradient
                    colors={t.material.kind === "paper" ? [t.colors.chipSelected, t.colors.chipSelected] : [t.colors.accentLit, t.colors.chipSelected, t.colors.accentDeep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text variant="bodyStrong" style={[styles.label, { color: t.colors.chipSelectedText }]} numberOfLines={1}>
                    {chip.label}
                  </Text>
                </View>
              ) : (
                <GlassSurface level="soft" radius={999} style={styles.chip}>
                  {busy ? <ActivityIndicator size="small" color={t.colors.chipText} style={styles.spinner} /> : null}
                  {/* Dimmed through the label only: opacity on anything around
                      the pane would cut its blur off from the room behind. */}
                  <Text
                    variant="body"
                    style={[styles.label, { color: t.colors.chipText }, disabled && !busy ? styles.dimmed : null]}
                    numberOfLines={1}
                  >
                    {chip.label}
                  </Text>
                </GlassSurface>
              )}
            </PressableScale>
          </Appear>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
  hit: { minHeight: 44, justifyContent: "center" },
  dimmed: { opacity: 0.55 },
  chip: { height: 41, minWidth: 84, paddingHorizontal: 20, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  selected: { overflow: "hidden", borderWidth: 1.2, boxShadow: "0px 0px 20px -4px rgba(180,40,70,0.44)" },
  label: { fontSize: 14.5 },
  spinner: { marginLeft: -4 },
});
