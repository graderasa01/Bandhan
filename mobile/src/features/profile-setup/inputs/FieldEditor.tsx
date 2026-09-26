import { Check, Info, Minus, Plus } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Chip, GlassCard, Icon, IconButton, Input, Pill, Text } from "~/components";
import { QUICK_PICKS, isValidFieldValue, questionFor, type FieldDef, type QuickSpec } from "~/catalog";
import type { FillingFor } from "~/types/api";
import { AboutField } from "./AboutField";
import { ChipField } from "./ChipField";
import { BirthTimePicker, DateOfBirthPicker } from "./DateTimeFields";
import { PlaceField } from "./PlaceField";
import { WheelPicker } from "./WheelPicker";

/** The fallback spec for a field the tap catalog has none for: chips if it has options, a text box if not. */
function specFor(field: FieldDef): QuickSpec {
  const spec = QUICK_PICKS[field.key];
  if (spec) return spec;
  if (field.options?.length) {
    return { input: { kind: "chips", nodes: field.options.map((o) => ({ label: o })), multi: field.type === "multiselect" } };
  }
  return { input: { kind: "text" } };
}

/** Where a question is being asked — the same field, the same catalog entry and the same storage path in every one. */
export type QuestionContext = "bolo" | "reel" | "dashboard" | "editor";

export type QuestionSaveState = "idle" | "saving" | "saved" | "error";

export interface FieldEditorProps {
  field: FieldDef;
  value: string;
  values: Record<string, string>;
  fillingFor: FillingFor;
  onChange: (key: string, value: string) => void;
  /** Mark it visibly when a required answer is still missing. */
  showRequired?: boolean;
  context?: QuestionContext;
  /** No card of its own — inside a sheet that already is one. */
  bare?: boolean;
  /** Shown beside the label: "Saving…", "Saved ✓", "Not saved". */
  saveState?: QuestionSaveState;
}

/**
 * ProfileQuestion — one profile question, answered the web's way, wherever it
 * is asked (the setup form, a glass editor sheet, Bolo's review, a dashboard
 * prompt). The question is the catalog's own wording in the right voice
 * ("Aapki…" for self, "Unki…" when a parent fills), "ye kyu chahiye?" is one
 * tap away where the catalog says why, a sensitive field says it is private
 * by default, and the answer widget comes from the tap catalog. The caller
 * owns the storage path (a draft, or `/api/profile/save-draft` as the
 * member's own confirmed value) — the question never stores anything itself.
 *
 * The reel's one-tap questions are the same catalog fields, drawn full-screen
 * by `FeedQuestionPage`.
 */
export const FieldEditor = memo(function FieldEditor({
  field,
  value,
  values,
  fillingFor,
  onChange,
  showRequired,
  bare = false,
  saveState = "idle",
}: FieldEditorProps) {
  const [why, setWhy] = useState(false);
  const spec = specFor(field);
  const forSelf = fillingFor === "self";
  const set = (v: string) => onChange(field.key, v);
  const missing = field.required && !isValidFieldValue(field, value);

  let body: React.ReactNode;
  const input = spec.input;
  switch (input.kind) {
    case "text":
      body = (
        <Input
          value={value}
          onChangeText={set}
          placeholder={field.placeholder ?? ""}
          autoCapitalize={field.key === "fullName" ? "words" : "sentences"}
        />
      );
      break;
    case "chips":
      body = (
        <ChipField
          nodes={input.nodes}
          value={value}
          onChange={set}
          multi={input.multi}
          columns={input.columns}
          dynamic={input.dynamic}
          religion={values.religion}
          allowOther={spec.other}
        />
      );
      break;
    case "wheel": {
      const idx = input.values.indexOf(value);
      body = (
        <WheelPicker
          values={input.values}
          index={idx >= 0 ? idx : Math.max(0, input.values.indexOf(`5'4"`))}
          unset={idx < 0}
          onChange={(i) => set(input.values[i]!)}
        />
      );
      break;
    }
    case "date":
      body = <DateOfBirthPicker value={value} onChange={set} />;
      break;
    case "time":
      body = <BirthTimePicker value={value} onChange={set} />;
      break;
    case "place":
      body = (
        <PlaceField
          value={value}
          onChange={set}
          popular={spec.popular}
          shortcuts={input.shortcuts}
          values={values}
          allowOther={spec.other}
        />
      );
      break;
    case "stepper": {
      const at = Math.max(0, input.stops.indexOf(value));
      const known = input.stops.includes(value);
      body = (
        <View style={styles.stepper}>
          <IconButton icon={Minus} label="Kam karein" onPress={() => set(input.stops[Math.max(0, at - 1)]!)} disabled={known && at === 0} />
          <Text variant="h2" center style={styles.stepValue}>
            {known ? value : "—"}
          </Text>
          <IconButton
            icon={Plus}
            label="Badhaiye"
            onPress={() => set(input.stops[known ? Math.min(input.stops.length - 1, at + 1) : 0]!)}
            disabled={known && at === input.stops.length - 1}
          />
        </View>
      );
      break;
    }
    case "compose":
      body = <AboutField value={value} onChange={set} values={values} fillingFor={fillingFor} />;
      break;
  }

  const content = (
    <>
      <View style={styles.head}>
        <Text variant="h3" style={styles.question}>
          {questionFor(field, forSelf)}
        </Text>
        {field.whyNeeded ? (
          <Pressable onPress={() => setWhy((w) => !w)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Ye kyu chahiye?">
            <Icon icon={Info} size={18} tone="gold" />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text variant="caption" tone="muted">
          {field.label}
        </Text>
        {showRequired && missing ? <Pill label="Required" tone="gold" /> : null}
        {field.sensitive ? <Pill label="Private by default" tone="neutral" /> : null}
        {saveState === "saving" ? (
          <Text variant="caption" tone="muted">
            Saving…
          </Text>
        ) : saveState === "saved" ? (
          <View style={styles.saved}>
            <Icon icon={Check} size={13} tone="success" strokeWidth={2.6} />
            <Text variant="caption" tone="success">
              Saved
            </Text>
          </View>
        ) : saveState === "error" ? (
          <Text variant="caption" tone="danger">
            Not saved
          </Text>
        ) : null}
      </View>
      {why && field.whyNeeded ? (
        <Text variant="small" tone="secondary" style={styles.why}>
          {field.whyNeeded}
        </Text>
      ) : null}
      {spec.hint ? (
        <Text variant="small" tone="muted" style={styles.hint}>
          {spec.hint}
        </Text>
      ) : null}
      <View style={styles.body}>{body}</View>
      {spec.escapes?.length ? (
        <View style={styles.escapes}>
          {spec.escapes.map((e) => (
            <Chip
              key={e.label}
              label={e.label}
              size="sm"
              selected={e.value !== null && value === e.value}
              onPress={() => set(e.value ?? "")}
            />
          ))}
        </View>
      ) : null}
    </>
  );

  return bare ? <View>{content}</View> : <GlassCard padding={16}>{content}</GlassCard>;
});

/** The consolidated name — see the comment on `FieldEditor`. */
export const ProfileQuestion = FieldEditor;

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  question: { flex: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  why: { marginTop: 8 },
  hint: { marginTop: 6 },
  body: { marginTop: 14 },
  escapes: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  saved: { flexDirection: "row", alignItems: "center", gap: 3 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 },
  stepValue: { minWidth: 110 },
});
