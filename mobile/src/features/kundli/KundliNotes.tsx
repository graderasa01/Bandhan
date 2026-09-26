import { AlertTriangle, CheckCircle2, Info } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, Text } from "~/components";
import { radius, useTheme } from "~/theme";
import type { KundliNote } from "~/types/api";
import { kundliToneColors } from "./tone";

/**
 * Gotra / manglik notes, as information rather than a verdict (the web's
 * `KundliNoteList`). Usually empty, and that is right: silence beats "sab
 * theek hai" filler, which would hide the real cautions.
 */
export const KundliNotes = memo(function KundliNotes({ notes }: { notes: KundliNote[] }) {
  const t = useTheme();
  if (notes.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text variant="label" tone="muted">
        Parampara ke hisaab se
      </Text>
      {notes.map((note) => {
        const tone = kundliToneColors(t.colors, note.tone);
        const glyph = note.tone === "ok" ? CheckCircle2 : note.tone === "info" ? Info : AlertTriangle;
        return (
          <View key={note.id} style={[styles.note, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
            <Icon icon={glyph} size={15} color={tone.fg} />
            <View style={styles.body}>
              <Text variant="smallStrong" style={{ color: tone.fg }}>
                {note.title}
              </Text>
              <Text variant="small" tone="secondary">
                {note.detail}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, gap: 2 },
});
