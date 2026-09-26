import { ChevronDown, ChevronUp, Lock, Minus, Plus, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheet, Chip, GlassCard, GhostButton, Icon, IconButton, Input, ListRow, PrimaryButton, Text } from "~/components";
import { DISCOVER, POPULAR_CITIES, cmToHeight, type FilterDef } from "~/catalog";
import { useTheme } from "~/theme";
import type { DiscoverFilters } from "~/types/api";
import { AGE_LIMITS, HEIGHT_LIMITS, clean, countActive } from "./filters";

type Filters = DiscoverFilters;

const BASIC_KEYS = ["lookingForGender", "minAge", "maxAge", "cities", "maritalStatus", "educationTier", "professionCategory", "motherTongue", "diet", "verifiedOnly"];
const NUMBER_STEP: Record<string, number> = { minAge: 1, maxAge: 1, minHeightCm: 3, maxHeightCm: 3, minTrustScore: 10, minCompleteness: 10 };

function numberBounds(key: string): [number, number] {
  if (key === "minAge" || key === "maxAge") return [AGE_LIMITS.min, AGE_LIMITS.max];
  if (key === "minHeightCm" || key === "maxHeightCm") return [HEIGHT_LIMITS.min, HEIGHT_LIMITS.max];
  return [0, 100];
}

function numberDefault(key: string): number {
  if (key === "minAge") return 24;
  if (key === "maxAge") return 32;
  if (key === "minHeightCm") return 152;
  if (key === "maxHeightCm") return 183;
  return 50;
}

function formatNumber(key: string, v: number) {
  if (key.includes("Height")) return cmToHeight(v);
  if (key.includes("Age")) return `${v} saal`;
  return `${v}`;
}

/**
 * Search filters in a bottom sheet, built from the web's `FILTER_CATALOG` —
 * the same labels, groups, options and consent notes the web sheet shows, so
 * anything picked here is a filter the server validates. Basics first;
 * everything else one tap away under "Advanced Filters".
 */
export function FilterSheet({
  visible,
  initial,
  onClose,
  onApply,
}: {
  visible: boolean;
  initial: Filters;
  onClose: () => void;
  onApply: (filters: Filters) => void;
}) {
  const t = useTheme();
  const [draft, setDraft] = useState<Filters>(initial);
  const [advanced, setAdvanced] = useState(false);
  // One search box per long list (cities, states, communities…).
  const [queries, setQueries] = useState<Record<string, string>>({});

  // Opened: the draft starts from the filters in force.
  const opening = visible ? initial : null;
  const [openedWith, setOpenedWith] = useState<Filters | null>(opening);
  if (opening !== openedWith) {
    setOpenedWith(opening);
    if (opening) setDraft(opening);
  }

  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }) as Filters);
  const basic = useMemo(() => BASIC_KEYS.map((k) => DISCOVER.filters.find((f) => f.key === k)).filter((f): f is FilterDef => Boolean(f)), []);
  const rest = useMemo(() => DISCOVER.filters.filter((f) => !BASIC_KEYS.includes(f.key) && f.key !== "name"), []);
  const groups = useMemo(() => {
    const map = new Map<string, FilterDef[]>();
    rest.forEach((f) => map.set(f.group, [...(map.get(f.group) ?? []), f]));
    return [...map.entries()];
  }, [rest]);

  const renderFilter = (f: FilterDef) => {
    const value = (draft as Record<string, unknown>)[f.key];
    const title = (
      <View style={styles.titleRow}>
        <Text variant="bodyStrong">{f.label}</Text>
        {f.sensitive ? <Icon icon={Lock} size={14} tone="muted" /> : null}
      </View>
    );
    const consent = f.sensitive ? (
      <Text variant="caption" tone="muted">
        Sirf un profiles me dhoondhega jinhone {DISCOVER.sensitiveLabels[f.sensitive] ?? f.label} search ke liye khula rakha hai.
      </Text>
    ) : null;

    if (f.kind === "bool") {
      return <ListRow key={f.key} title={f.label} toggle={{ value: Boolean(value), onChange: (v) => set(f.key, v || undefined) }} last />;
    }

    if (f.kind === "number") {
      const [lo, hi] = numberBounds(f.key);
      const step = NUMBER_STEP[f.key] ?? 1;
      const n = typeof value === "number" ? value : null;
      return (
        <View key={f.key} style={styles.block}>
          {title}
          <View style={styles.stepper}>
            <IconButton icon={Minus} label={`Decrease ${f.label}`} size={40} onPress={() => set(f.key, Math.max(lo, (n ?? numberDefault(f.key)) - step))} />
            <Pressable onPress={() => n === null && set(f.key, numberDefault(f.key))} style={styles.stepValue}>
              <Text variant="h3" center>
                {n === null ? "Any" : formatNumber(f.key, n)}
              </Text>
            </Pressable>
            <IconButton icon={Plus} label={`Increase ${f.label}`} size={40} onPress={() => set(f.key, Math.min(hi, (n ?? numberDefault(f.key)) + step))} />
            {n !== null ? <GhostButton label="Clear" size="sm" onPress={() => set(f.key, undefined)} /> : null}
          </View>
        </View>
      );
    }

    if (f.kind === "text") {
      return (
        <View key={f.key} style={styles.block}>
          {title}
          <Input value={typeof value === "string" ? value : ""} onChangeText={(v) => set(f.key, v || undefined)} placeholder={f.label} />
          {consent}
        </View>
      );
    }

    const options = f.options ?? [];
    const selected = f.kind === "multi" ? new Set(Array.isArray(value) ? (value as string[]) : []) : new Set(typeof value === "string" ? [value] : []);
    const toggle = (o: string) => {
      if (f.kind === "single") {
        set(f.key, selected.has(o) ? undefined : o);
        return;
      }
      const next = new Set(selected);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      set(f.key, next.size ? [...next] : undefined);
    };

    // Long lists (cities, communities) get a search box and show picks + popular first.
    const long = options.length > 16;
    const query = queries[f.key] ?? "";
    let shown = options;
    if (long) {
      const q = query.trim().toLowerCase();
      const base = f.key === "cities" || f.key === "workCity" ? POPULAR_CITIES : options.slice(0, 12);
      shown = q.length >= 2 ? options.filter((o) => o.toLowerCase().includes(q)).slice(0, 20) : [...new Set([...selected, ...base])];
    }

    return (
      <View key={f.key} style={styles.block}>
        {title}
        {long ? (
          <Input
            icon={Search}
            value={query}
            onChangeText={(v) => setQueries((prev) => ({ ...prev, [f.key]: v }))}
            placeholder={`${f.label} dhoondhiye`}
          />
        ) : null}
        <View style={styles.chips}>
          {shown.map((o) => (
            <Chip key={o} label={f.key === "lookingForGender" ? (o === "Ladki" ? "Ladkiyan" : "Ladke") : o} size="sm" selected={selected.has(o)} onPress={() => toggle(o)} />
          ))}
        </View>
        {consent}
      </View>
    );
  };

  const count = countActive(clean(draft));

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      subtitle={count ? `${count} filters chune` : "Jo zaroori ho, wahi chuniye"}
      footer={
        <View style={styles.footer}>
          <GhostButton label="Clear All" onPress={() => setDraft({ lookingForGender: draft.lookingForGender })} style={{ flex: 1 }} />
          <PrimaryButton label="Show Results" onPress={() => onApply(clean(draft))} fullWidth={false} style={{ flex: 2 }} />
        </View>
      }
    >
      <View style={{ gap: 18 }}>
        {basic.map(renderFilter)}
        <Pressable
          onPress={() => setAdvanced((a) => !a)}
          accessibilityRole="button"
          accessibilityState={{ expanded: advanced }}
          style={[styles.advanced, { borderColor: t.colors.rim }]}
        >
          <Text variant="bodyStrong" tone="gold" style={{ flex: 1 }}>
            Advanced Filters
          </Text>
          <Icon icon={advanced ? ChevronUp : ChevronDown} size={20} tone="gold" />
        </Pressable>
        {advanced
          ? groups.map(([group, filters]) => (
              <GlassCard key={group} level="soft" padding={14}>
                <Text variant="label" tone="gold" style={{ marginBottom: 12 }}>
                  {DISCOVER.groupLabels[group as FilterDef["group"]] ?? group}
                </Text>
                <View style={{ gap: 18 }}>{filters.map(renderFilter)}</View>
              </GlassCard>
            ))
          : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepValue: { minWidth: 96 },
  advanced: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footer: { flexDirection: "row", gap: 10, alignItems: "center" },
});
