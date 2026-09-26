import { useQuery } from "@tanstack/react-query";
import { ExternalLink, UserRound } from "lucide-react-native";
import { memo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Avatar, BottomSheet, GlassCard, PrimaryButton, SecondaryButton, Text } from "~/components";
import type { ConciergePersonOption } from "~/shared/grio/concierge";
import { fonts, radius, useTheme } from "~/theme";
import { firstNameOf } from "~/utils/names";
import { labelOf, specOf, websiteFor } from "../engine/actionPolicy";
import { ASK_QUESTION_MAX_LENGTH } from "../engine/learn";
import type { GrioPending } from "../engine/types";
import { useGrio, useGrioState } from "../GrioProvider";

const MESSAGE_MAX_LENGTH = 2000;

/**
 * Every question the engine can be waiting on, as the app's one sheet:
 *
 *   confirm      the catalog's own confirm copy, naming the person — the last
 *                stop before an interest, a boost, a matchmaker request
 *   pickPerson   "Kis par?" — the only way a targeted action gets a person
 *                when none was open; the list comes from the server and never
 *                reaches the model
 *   pickMatch    "Kise bhejein?" — chat-open matches only
 *   draft        the editable message / question; nothing leaves without Send
 *   unavailable  a thing the app cannot do yet, said plainly, with where it can
 */
export function GrioSheets() {
  const pending = useGrioState((s) => s.pending);
  const engine = useGrio();
  const close = () => engine.cancelPending();
  return (
    <>
      <ConfirmSheet pending={pending?.kind === "confirm" ? pending : null} onClose={close} />
      <PersonPicker open={pending?.kind === "pickPerson"} onClose={close} />
      <MatchPicker open={pending?.kind === "pickMatch"} onClose={close} />
      <DraftSheet pending={pending?.kind === "draft" ? pending : null} onClose={close} />
      <UnavailableSheet pending={pending?.kind === "unavailable" ? pending : null} onClose={close} />
    </>
  );
}

/** The last thing a sheet showed — so it keeps its words while it slides away. */
function useLast<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}

const ConfirmSheet = memo(function ConfirmSheet({ pending: live, onClose }: { pending: Extract<GrioPending, { kind: "confirm" }> | null; onClose: () => void }) {
  const engine = useGrio();
  const running = useGrioState((s) => s.running);
  const pending = useLast(live);
  const spec = pending ? specOf(pending.key) : null;
  return (
    <BottomSheet
      visible={live !== null}
      onClose={onClose}
      title={spec?.label}
      subtitle={spec?.confirm}
      footer={
        <View style={styles.pair}>
          <SecondaryButton label="Cancel" fullWidth={false} style={{ flex: 1 }} disabled={running} onPress={onClose} />
          <PrimaryButton label="Confirm" fullWidth={false} style={{ flex: 1 }} loading={running} onPress={() => void engine.confirmPending()} />
        </View>
      }
    >
      {pending?.target ? (
        <GlassCard padding={14} level="soft">
          <View style={styles.personRow}>
            <Avatar uri={null} name={pending.target.name} size={40} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              Ye {pending.target.name} par hoga.
            </Text>
          </View>
        </GlassCard>
      ) : null}
    </BottomSheet>
  );
});

const PERSON_GROUPS: Array<{ source: ConciergePersonOption["source"]; label: string }> = [
  { source: "interest_received", label: "Inhone aapko interest bheja hai" },
  { source: "shortlist", label: "Aapki shortlist" },
  { source: "same_vote", label: "Inhone aaj aapke jaisa jawab diya" },
];

const PersonPicker = memo(function PersonPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useGrio();
  const t = useTheme();
  const people = useQuery({ queryKey: ["grio-people"], queryFn: () => engine.transport.people(), enabled: open, staleTime: 0, gcTime: 0 });
  return (
    <BottomSheet visible={open} onClose={onClose} title="Kis par?" subtitle="Aap jise chunenge, sirf usi par hoga.">
      {people.isPending ? (
        <ActivityIndicator color={t.colors.gold} style={{ marginVertical: 24 }} />
      ) : people.isError ? (
        <Text variant="small" tone="danger" center style={{ marginVertical: 16 }}>
          List load nahi ho payi — internet check karke dobara try karein.
        </Text>
      ) : people.data.length === 0 ? (
        <Text variant="small" tone="secondary" center style={{ marginVertical: 16 }}>
          Abhi koi aisa rishta nahi hai. Kisi ki profile khol kar wahin se ye kaam kar sakte hain.
        </Text>
      ) : (
        <View style={{ gap: 14 }}>
          {PERSON_GROUPS.map((group) => {
            const rows = people.data.filter((p) => p.source === group.source);
            if (rows.length === 0) return null;
            return (
              <View key={group.source} style={{ gap: 4 }}>
                <Text variant="label" tone="muted">
                  {group.label}
                </Text>
                {rows.map((p) => (
                  <PickRow key={p.profileId} name={p.name} photoUrl={null} onPress={() => void engine.pickPerson(p)} />
                ))}
              </View>
            );
          })}
        </View>
      )}
    </BottomSheet>
  );
});

const MatchPicker = memo(function MatchPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useGrio();
  const t = useTheme();
  const matches = useQuery({ queryKey: ["grio-matches"], queryFn: () => engine.transport.matches(), enabled: open, staleTime: 0, gcTime: 0 });
  return (
    <BottomSheet visible={open} onClose={onClose} title="Kise bhejein?" subtitle="Sirf wo matches jinse chat khuli hai.">
      {matches.isPending ? (
        <ActivityIndicator color={t.colors.gold} style={{ marginVertical: 24 }} />
      ) : matches.isError ? (
        <Text variant="small" tone="danger" center style={{ marginVertical: 16 }}>
          List load nahi ho payi — internet check karke dobara try karein.
        </Text>
      ) : matches.data.length === 0 ? (
        <Text variant="small" tone="secondary" center style={{ marginVertical: 16 }}>
          Koi chat-unlocked match nahi mila.
        </Text>
      ) : (
        <View style={{ gap: 4 }}>
          {matches.data.map((m) => (
            <PickRow key={m.matchId} name={m.name} photoUrl={m.photoUrl} onPress={() => engine.pickMatch(m)} />
          ))}
        </View>
      )}
    </BottomSheet>
  );
});

function PickRow({ name, photoUrl, onPress }: { name: string; photoUrl: string | null; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={({ pressed }) => [styles.pickRow, { backgroundColor: pressed ? t.colors.glassSoft : "transparent", borderBottomColor: t.colors.divider }]}
    >
      <Avatar uri={photoUrl} name={name} size={42} />
      <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

const DraftSheet = memo(function DraftSheet({ pending: live, onClose }: { pending: Extract<GrioPending, { kind: "draft" }> | null; onClose: () => void }) {
  const engine = useGrio();
  const t = useTheme();
  const running = useGrioState((s) => s.running);
  const pending = useLast(live);
  const [text, setText] = useState(live?.text ?? "");
  // A new draft starts from its own words; closing keeps the old ones while it slides away.
  const [prevDraft, setPrevDraft] = useState(live);
  if (live !== prevDraft) {
    setPrevDraft(live);
    if (live) setText(live.text);
  }
  const isAsk = pending?.draft.kind === "ask";
  const max = isAsk ? ASK_QUESTION_MAX_LENGTH : MESSAGE_MAX_LENGTH;
  const name = pending ? firstNameOf(pending.draft.target.name) : "";
  return (
    <BottomSheet
      visible={live !== null}
      onClose={onClose}
      title={isAsk ? `${name} se sawaal poochhein` : `Send to ${name}`}
      subtitle={
        isAsk
          ? "Ek insaan se zindagi me sirf ek hi sawaal poochha ja sakta hai — bhejne se pehle padh lijiye."
          : "Grio ka sujhav hai — bhejne se pehle jaise chahein badal lijiye."
      }
      footer={
        <View style={styles.pair}>
          <SecondaryButton label="Cancel" fullWidth={false} style={{ flex: 1 }} disabled={running} onPress={onClose} />
          <PrimaryButton
            label={isAsk ? "Ask" : "Send"}
            fullWidth={false}
            style={{ flex: 1 }}
            loading={running}
            disabled={!text.trim()}
            onPress={() => void engine.confirmPending(text)}
          />
        </View>
      }
    >
      <View style={[styles.editor, { backgroundColor: t.colors.input, borderColor: t.colors.rim }]}>
        <TextInput
          value={text}
          onChangeText={(v) => setText(v.slice(0, max))}
          multiline
          autoFocus={Platform.OS !== "web"}
          maxLength={max}
          style={[styles.editorInput, { color: t.colors.text, fontFamily: fonts.regular }]}
          placeholderTextColor={t.colors.textMuted}
          placeholder={isAsk ? "Apna sawaal likhiye…" : "Message likhiye…"}
          accessibilityLabel={isAsk ? "Question text" : "Message text"}
          maxFontSizeMultiplier={1.3}
        />
      </View>
      <Text variant="caption" tone="muted" style={{ alignSelf: "flex-end", marginTop: 6 }}>
        {text.length}/{max}
      </Text>
    </BottomSheet>
  );
});

const UnavailableSheet = memo(function UnavailableSheet({
  pending: live,
  onClose,
}: {
  pending: Extract<GrioPending, { kind: "unavailable" }> | null;
  onClose: () => void;
}) {
  const engine = useGrio();
  const pending = useLast(live);
  const website = pending ? websiteFor(pending.key, pending.target) : null;
  return (
    <BottomSheet
      visible={live !== null}
      onClose={onClose}
      title={pending ? labelOf(pending.key) : ""}
      subtitle="Ye abhi app me nahi hai."
      footer={
        <View style={{ gap: 10 }}>
          {website ? (
            <PrimaryButton label="Open Website" icon={ExternalLink} onPress={() => pending && engine.openWebsiteFor(pending.key, pending.target)} />
          ) : null}
          {pending?.target ? (
            <SecondaryButton
              label={`Open ${firstNameOf(pending.target.name)}'s Profile`}
              icon={UserRound}
              onPress={() => {
                const target = pending.target!;
                onClose();
                engine.openProfile(target.profileId);
              }}
            />
          ) : null}
        </View>
      }
    >
      <Text variant="body" tone="secondary">
        {website
          ? "Website par login karke ye kar sakte hain. Grio aapke liye ise chupchaap nahi karta — ye aapka apna kadam hai."
          : "Jab ye app me aayega, Grio yahin se karwa dega."}
      </Text>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  pair: { flexDirection: "row", gap: 10 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm },
  editor: { borderWidth: 1, borderRadius: radius.md, minHeight: 120 },
  editorInput: { fontSize: 16, lineHeight: 22, paddingHorizontal: 14, paddingVertical: 12, minHeight: 120, textAlignVertical: "top", outlineWidth: 0 },
});
