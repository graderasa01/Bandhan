import { ChevronLeft, PencilLine } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Chip, GhostButton, Input, Text } from "~/components";
import { communitiesFor, pathToValue, type QuickNode } from "~/catalog";

const nodeValue = (n: QuickNode) => n.value ?? n.label;

/**
 * The web's tap-first answer (quickPicks.ts "chips"): a grid of chips, which
 * may branch — tapping "Job" swaps the chips for industries, then roles, in
 * place — or allow several picks (stored comma-joined, as the catalog
 * expects). Nothing here invents a value: a leaf stores its catalog value.
 */
export const ChipField = memo(function ChipField({
  nodes,
  value,
  onChange,
  multi,
  columns,
  dynamic,
  religion,
  allowOther,
}: {
  nodes: QuickNode[];
  value: string;
  onChange: (v: string) => void;
  multi?: boolean;
  columns?: 1 | 2;
  dynamic?: "community";
  religion?: string;
  allowOther?: boolean;
}) {
  const all = useMemo<QuickNode[]>(() => {
    if (dynamic !== "community") return nodes;
    const extra: QuickNode[] = communitiesFor(religion).map((c) => ({ label: c }));
    return [...nodes, ...extra];
  }, [nodes, dynamic, religion]);

  // Open the branch the stored value lives in, so a re-opened answer shows its path.
  const initialPath = useMemo(() => {
    if (multi || !value) return [];
    const path = pathToValue(all, value);
    return path ? path.slice(0, -1) : [];
  }, [all, multi, value]);
  const [path, setPath] = useState<QuickNode[]>(initialPath);
  const [otherOpen, setOtherOpen] = useState(false);

  const level = path.length ? (path[path.length - 1]!.children ?? []) : all;
  const picked = multi ? new Set(value.split(",").map((s) => s.trim()).filter(Boolean)) : new Set(value ? [value] : []);
  const isKnown = !value || multi || Boolean(pathToValue(all, value));

  const toggle = (n: QuickNode) => {
    if (n.children?.length) {
      setPath([...path, n]);
      return;
    }
    const v = nodeValue(n);
    if (multi) {
      const next = new Set(picked);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      onChange([...next].join(","));
    } else {
      onChange(v);
    }
  };

  const ask = path.length ? path[path.length - 1]!.ask : null;

  return (
    <View style={styles.wrap}>
      {path.length ? (
        <View style={styles.crumbs}>
          <GhostButton label="Back" icon={ChevronLeft} size="sm" onPress={() => setPath(path.slice(0, -1))} />
          <Text variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {path.map((p) => p.label).join(" › ")}
          </Text>
        </View>
      ) : null}
      {ask ? (
        <Text variant="bodyStrong" tone="secondary">
          {ask}
        </Text>
      ) : null}
      {dynamic === "community" && !religion && level.length <= nodes.length ? (
        <Text variant="small" tone="muted">
          Religion pehle chuniye to yahan aapki community ki list aayegi.
        </Text>
      ) : null}
      <View style={[styles.grid, columns === 2 && styles.twoCol]}>
        {level.map((n) => {
          const v = nodeValue(n);
          const selected = !n.children && picked.has(v);
          return (
            <View key={`${n.label}-${v}`} style={columns === 2 ? styles.cell : undefined}>
              <Chip
                label={n.children ? `${n.label} ›` : n.label}
                selected={selected}
                onPress={() => toggle(n)}
                block={columns === 2}
              />
            </View>
          );
        })}
      </View>
      {!isKnown && !otherOpen ? (
        <Text variant="small" tone="secondary">
          Abhi: {value}
        </Text>
      ) : null}
      {allowOther ? (
        otherOpen ? (
          <Input
            label="Apna jawab likhiye"
            value={isKnown ? "" : value}
            onChangeText={onChange}
            placeholder="Yahan likhiye"
            autoFocus
          />
        ) : (
          <GhostButton label="Not listed? Type it" icon={PencilLine} size="sm" onPress={() => setOtherOpen(true)} style={styles.other} />
        )
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  crumbs: { flexDirection: "row", alignItems: "center", gap: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  twoCol: { justifyContent: "space-between" },
  cell: { width: "48.5%" },
  other: { alignSelf: "flex-start" },
});
