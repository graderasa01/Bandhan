import { ArrowRight, Check, ChevronRight, ExternalLink, Orbit, UserRound, Users } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import type { GrioActionKey } from "~/shared/grio/grio";
import type { GrioProfileAction, GrioPromptSuggestion } from "~/shared/grio/grioProfile";
import { labelOf, navTargetOf, policyOf } from "../engine/actionPolicy";
import { chipId } from "../engine/engine";
import { useGrio, useGrioState } from "../GrioProvider";
import { GrioPill } from "./GrioPill";

/**
 * The buttons under a reply. Which keys appear is the reply's (through the
 * web parser — an unknown key never gets here); what each button *says* is
 * the catalog's; what pressing it does is the engine's tier for that row.
 * Nothing here reads the model's text.
 */
export const GrioActionChips = memo(function GrioActionChips({ messageId, keys }: { messageId: string; keys: GrioActionKey[] }) {
  const engine = useGrio();
  const completed = useGrioState((s) => s.completed);
  const running = useGrioState((s) => s.running);
  if (keys.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {keys.map((key) => {
        const done = completed[chipId(messageId, key)] === true;
        const external = policyOf(key).tier === "navigate" && navTargetOf(key)?.kind === "web";
        return (
          <GrioPill
            key={key}
            tone="action"
            label={done ? "Done" : labelOf(key)}
            icon={done ? Check : ArrowRight}
            trailingIcon={external ? ExternalLink : undefined}
            accessibilityHint={external ? "Opens the website" : undefined}
            done={done}
            disabled={running}
            onPress={() => void engine.tapChip(messageId, key)}
          />
        );
      })}
    </View>
  );
});

/**
 * A profile answer's next steps — every one an existing door: the profile
 * screen (which shows every section and the kundli notes this member may
 * see), or a follow-up question asked as if typed. Catalog buttons from the
 * same answer go through `GrioActionChips`, so they share its confirm rules.
 */
export const GrioProfileNext = memo(function GrioProfileNext({
  messageId,
  actions,
  followUps,
}: {
  messageId: string;
  actions: GrioProfileAction[];
  followUps: GrioPromptSuggestion[];
}) {
  const engine = useGrio();
  const sending = useGrioState((s) => s.sending);
  const doors = actions.filter((a) => a.kind !== "catalog");
  if (doors.length === 0 && followUps.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {doors.length > 0 ? (
        <View style={styles.wrap}>
          {doors.map((a) => (
            <GrioPill
              key={a.id}
              tone="action"
              label={a.label}
              icon={
                a.kind === "open_kundli" ? Orbit : a.kind === "open_section" && a.section === "family" ? Users : a.kind === "view_profile" ? UserRound : undefined
              }
              disabled={sending && a.kind === "ask"}
              onPress={() => engine.tapProfileAction(messageId, a)}
            />
          ))}
        </View>
      ) : null}
      {followUps.length > 0 ? (
        <View style={styles.wrap}>
          {followUps.map((s) => (
            <GrioPill key={s.id} label={s.label} trailingIcon={ChevronRight} disabled={sending} onPress={() => void engine.ask(s.ask, { source: "chip" })} />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
