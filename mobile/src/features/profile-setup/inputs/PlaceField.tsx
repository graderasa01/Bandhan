import { ChevronRight, MapPin, Search } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheet, Chip, GhostButton, Icon, Input, Text } from "~/components";
import { PLACES, SAME_AS_PREFIX, searchCities, stateOfCity, type QuickNode } from "~/catalog";
import { useTheme } from "~/theme";

/**
 * A place (quickPicks "place"): popular cities as one tap, a search across
 * the whole list, State → City for browsing, "Same as my city" shortcuts, and
 * "Not listed" for the rare answer. A fixed list is the point — it is what
 * makes the city filter in search actually match people to each other.
 */
export const PlaceField = memo(function PlaceField({
  value,
  onChange,
  popular,
  shortcuts,
  values,
  allowOther,
}: {
  value: string;
  onChange: (v: string) => void;
  popular?: string[];
  shortcuts?: QuickNode[];
  values: Record<string, string>;
  allowOther?: boolean;
}) {
  const t = useTheme();
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [other, setOther] = useState(false);

  const results = useMemo(() => searchCities(query, 30), [query]);
  const resolveShortcut = (n: QuickNode): string | null => {
    const v = n.value ?? n.label;
    if (!v.startsWith(SAME_AS_PREFIX)) return v;
    const key = v.slice(SAME_AS_PREFIX.length);
    return values[key]?.trim() ? values[key]! : null;
  };

  const pick = (city: string) => {
    onChange(city);
    setSheet(false);
    setQuery("");
    setState(null);
  };

  return (
    <View style={styles.wrap}>
      {value ? (
        <View style={[styles.current, { borderColor: t.colors.rim, backgroundColor: t.colors.accentSoft }]}>
          <Icon icon={MapPin} size={18} tone="gold" />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {value}
            {stateOfCity(value) ? <Text variant="small" tone="muted">{`  ${stateOfCity(value)}`}</Text> : null}
          </Text>
        </View>
      ) : null}

      {shortcuts?.length ? (
        <View style={styles.row}>
          {shortcuts.map((s) => {
            const resolved = resolveShortcut(s);
            return (
              <Chip
                key={s.label}
                label={s.label}
                size="sm"
                disabled={!resolved}
                selected={Boolean(resolved && resolved === value)}
                onPress={() => resolved && onChange(resolved)}
                style={{ opacity: resolved ? 1 : 0.5 }}
              />
            );
          })}
        </View>
      ) : null}

      {popular?.length ? (
        <View style={styles.row}>
          {popular.slice(0, 8).map((c) => (
            <Chip key={c} label={c} size="sm" selected={value === c} onPress={() => onChange(c)} />
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => setSheet(true)}
        accessibilityRole="button"
        accessibilityLabel="Search all cities"
        style={[styles.search, { borderColor: t.colors.rim, backgroundColor: t.colors.input }]}
      >
        <Icon icon={Search} size={18} tone="muted" />
        <Text variant="body" tone="muted" style={{ flex: 1 }}>
          Sheher dhoondhiye…
        </Text>
        <Icon icon={ChevronRight} size={18} tone="muted" />
      </Pressable>

      {allowOther ? (
        other ? (
          <Input label="Apna sheher likhiye" value={value} onChangeText={onChange} placeholder="Sheher ka naam" autoFocus />
        ) : (
          <GhostButton label="Not listed? Type it" size="sm" onPress={() => setOther(true)} style={{ alignSelf: "flex-start" }} />
        )
      ) : null}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title={state ?? "Sheher chuniye"} subtitle={state ? undefined : "Naam likhiye ya state se chuniye"}>
        {!state ? (
          <View style={{ gap: 12 }}>
            <Input icon={Search} value={query} onChangeText={setQuery} placeholder="Jaise: Indore" autoFocus />
            {query.trim().length >= 2 ? (
              results.length ? (
                results.map((r) => (
                  <Pressable key={`${r.city}-${r.state}`} onPress={() => pick(r.city)} style={styles.option} accessibilityRole="button">
                    <Text variant="bodyStrong">{r.city}</Text>
                    <Text variant="small" tone="muted">
                      {r.state}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text variant="small" tone="muted">
                  Ye sheher list me nahi mila — neeche &quot;Not listed&quot; se likh sakte hain.
                </Text>
              )
            ) : (
              PLACES.map((p) => (
                <Pressable key={p.state} onPress={() => setState(p.state)} style={[styles.option, styles.optionRow]} accessibilityRole="button">
                  <Text variant="bodyStrong">{p.state}</Text>
                  <Icon icon={ChevronRight} size={18} tone="muted" />
                </Pressable>
              ))
            )}
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            <GhostButton label="All states" size="sm" onPress={() => setState(null)} style={{ alignSelf: "flex-start" }} />
            {(PLACES.find((p) => p.state === state)?.cities ?? []).map((c) => (
              <Pressable key={c} onPress={() => pick(c)} style={styles.option} accessibilityRole="button">
                <Text variant={c === value ? "bodyStrong" : "body"} tone={c === value ? "gold" : "primary"}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </BottomSheet>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  current: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
  option: { paddingVertical: 12, minHeight: 48, justifyContent: "center" },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
