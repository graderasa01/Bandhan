import { Footprints, Search } from "lucide-react-native";
import { memo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "~/components";
import { firstNameOf } from "~/utils/names";
import { CANDIDATE_STARTERS, MATCH_STARTERS, SHORTCUTS, fill, type GrioChip } from "../engine/starters";
import { useGrio, useGrioState } from "../GrioProvider";
import { GrioPill } from "./GrioPill";

/**
 * The rail above the composer — the web panel's, in the same fixed slots so
 * the thumb learns where things are: on a profile, that profile's own four
 * questions (from `/api/grio/profile/:id`, static stand-ins until they land);
 * in a chat, the four message helpers; otherwise "Walk me through today" and
 * the four shortcuts. During the walk, its own Next / Stop replace the rail.
 */
export const GrioRail = memo(function GrioRail() {
  const engine = useGrio();
  const scope = useGrioState((s) => s.scope);
  const brief = useGrioState((s) => s.brief);
  const walk = useGrioState((s) => s.walk);
  const sending = useGrioState((s) => s.sending);
  const discovery = useGrioState((s) => s.discovery);

  if (walk) {
    const step = walk.steps[walk.index];
    const last = walk.index + 1 >= walk.steps.length;
    return (
      <View style={styles.walk}>
        <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {walk.index + 1} / {walk.steps.length} · {step ? firstNameOf(step.name) : ""}
        </Text>
        <GrioPill tone="action" label={last ? "Finish" : "Next Rishta"} disabled={sending} onPress={() => engine.nextStep()} />
        <GrioPill label="Stop" onPress={() => engine.endWalkthrough()} />
      </View>
    );
  }

  let chips: GrioChip[];
  if (scope?.kind === "candidate") {
    const own = brief?.profileId === scope.profileId && brief.data?.ok ? (brief.data.suggestions ?? []) : [];
    chips = own.length > 0 ? own.map((s) => ({ id: s.id, label: s.label, ask: s.ask })) : CANDIDATE_STARTERS.map((c) => fill(c, firstNameOf(scope.name)));
  } else if (scope?.kind === "match") {
    chips = MATCH_STARTERS.map((c) => fill(c, firstNameOf(scope.name)));
  } else {
    chips = SHORTCUTS;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} keyboardShouldPersistTaps="handled">
      {!scope && discovery ? (
        <GrioPill tone="primary" icon={Search} label="Show These Profiles" disabled={sending} onPress={() => void engine.showDiscoveryResults()} />
      ) : null}
      {!scope ? <GrioPill tone="action" icon={Footprints} label="Walk Me Through Today" disabled={sending} onPress={() => void engine.startWalkthrough()} /> : null}
      {chips.map((c) => (
        <GrioPill key={c.id} label={c.label} disabled={sending} onPress={() => void engine.ask(c.ask, { source: "chip" })} />
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  rail: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  walk: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
});
