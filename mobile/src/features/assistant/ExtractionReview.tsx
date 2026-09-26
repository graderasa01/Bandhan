import { Check, Circle, Quote } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GlassCard, Icon, Pill, PrimaryButton, Text, toast } from "~/components";
import { FIELD_BY_KEY } from "~/catalog";
import { formatDob } from "~/features/profile-setup/inputs/DateTimeFields";
import { useSaveProfile } from "~/hooks/queries";
import { errorMessage } from "~/services/api/client";
import type { ExtractedValue } from "~/services/ai";
import { useTheme } from "~/theme";
import type { FieldMeta } from "~/types/api";

function confidenceLabel(c: number): { label: string; tone: "success" | "gold" | "neutral" } {
  if (c >= 0.8) return { label: "Pakka", tone: "success" };
  if (c >= 0.6) return { label: "Shayad", tone: "gold" };
  return { label: "Andaaza", tone: "neutral" };
}

const show = (key: string, v: string) => (key === "dateOfBirth" ? (formatDob(v) ?? v) : v.split(",").join(", "));

/**
 * What the AI read, before anything is saved. "AI never invents data" ends
 * here: every value is shown with the words it came from, guesses are marked
 * and start unticked, a value that would replace one the member already gave
 * says so, and only what the member keeps ticked is written — as a value they
 * confirmed (`source: "ai", confirmed: true`), which is what readiness counts.
 */
export function ExtractionReview({
  values,
  current,
  onSaved,
}: {
  values: ExtractedValue[];
  current: Record<string, string>;
  onSaved: (keys: string[]) => void;
}) {
  const t = useTheme();
  const save = useSaveProfile();
  const unique = useMemo(() => {
    const seen = new Map<string, ExtractedValue>();
    values.forEach((v) => {
      const prev = seen.get(v.key);
      if (!prev || v.confidence > prev.confidence) seen.set(v.key, v);
    });
    return [...seen.values()];
  }, [values]);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(unique.filter((v) => !v.inferred && v.confidence >= 0.6 && current[v.key] !== v.value).map((v) => v.key)),
  );

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function submit() {
    const chosen = unique.filter((v) => picked.has(v.key));
    if (!chosen.length) return;
    const valuesOut = Object.fromEntries(chosen.map((v) => [v.key, v.value]));
    const meta: Record<string, FieldMeta> = Object.fromEntries(
      chosen.map((v) => [v.key, { source: "ai" as const, confirmed: true, confidence: v.confidence, sourceSpan: v.sourceSpan ?? undefined }]),
    );
    try {
      const res = await save.mutateAsync({ values: valuesOut, meta });
      toast.success(`${chosen.length} fields save ho gaye`);
      if (res.justActivated) toast.success("Aapki profile ab live hai! 🎉");
      onSaved(chosen.map((v) => v.key));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (unique.length === 0) {
    return (
      <GlassCard padding={16}>
        <Text variant="bodyStrong">Is baar koi field samajh nahi aaya</Text>
        <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
          Thoda aur detail me boliye — jaise naam, umar, sheher, padhai ya kaam.
        </Text>
      </GlassCard>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text variant="label" tone="gold">
        Grio ne ye samjha — sahi wale tick rakhiye
      </Text>
      {unique.map((v) => {
        const def = FIELD_BY_KEY[v.key];
        const on = picked.has(v.key);
        const conf = confidenceLabel(v.confidence);
        const existing = current[v.key];
        return (
          <Pressable
            key={v.key}
            onPress={() => toggle(v.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${def?.label ?? v.key}: ${v.value}`}
          >
            <GlassCard padding={14} active={on} level="soft">
              <View style={styles.row}>
                <View style={[styles.check, { borderColor: on ? t.colors.gold : t.colors.rim, backgroundColor: on ? t.colors.accent : "transparent" }]}>
                  {on ? <Icon icon={Check} size={15} color={t.colors.accentFg} strokeWidth={2.6} /> : <Icon icon={Circle} size={4} tone="muted" />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    {def?.label ?? v.key}
                  </Text>
                  <Text variant="bodyStrong">{show(v.key, v.value)}</Text>
                  {existing && existing !== v.value ? (
                    <Text variant="caption" tone="warn">
                      Abhi: {show(v.key, existing)} — tick karne par badal jayega
                    </Text>
                  ) : null}
                </View>
                <Pill label={v.inferred ? "Andaaza" : conf.label} tone={v.inferred ? "neutral" : conf.tone} />
              </View>
              {v.sourceSpan ? (
                <View style={styles.span}>
                  <Icon icon={Quote} size={12} tone="muted" />
                  <Text variant="caption" tone="muted" numberOfLines={2} style={{ flex: 1 }}>
                    {v.sourceSpan}
                  </Text>
                </View>
              ) : null}
            </GlassCard>
          </Pressable>
        );
      })}
      <PrimaryButton label={picked.size ? `Save ${picked.size} Fields` : "Select fields to save"} onPress={submit} loading={save.isPending} disabled={!picked.size} style={{ marginTop: 6 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  span: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingLeft: 38 },
});
