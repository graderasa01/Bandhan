import { CircleAlert } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Icon, SecondaryButton, Text } from "~/components";
import { FIELD_BY_KEY, isValidFieldValue } from "~/catalog";
import { ProfileQuestion } from "~/features/profile-setup/inputs/FieldEditor";
import { useMyProfile, useSaveProfile } from "~/hooks/queries";
import { errorMessage } from "~/services/api/client";
import { useTheme } from "~/theme";
import type { FillingFor } from "~/types/api";

export interface FieldsEditState {
  keys: string[];
  values: Record<string, string>;
  fillingFor: FillingFor;
  ready: boolean;
  loadError: unknown;
  retryLoad: () => void;
  set: (key: string, value: string) => void;
  error: string | null;
  canSave: boolean;
  saving: boolean;
  /** Resolves true once the server has every changed value. */
  save: () => Promise<boolean>;
}

/**
 * A few of the member's own fields, edited in place — the targeted form the
 * web opens with `?fields=` (a kundli's birth details, the reel's "aapki
 * pasand" notice), never the whole profile. It starts from what the profile
 * holds, writes only what changed and only once every changed value is one the
 * field accepts, through the ordinary autosave (`useSaveProfile`, which also
 * refreshes whatever the change affects).
 */
export function useFieldsEdit(keys: string[]): FieldsEditState {
  const me = useMyProfile();
  const saveProfile = useSaveProfile();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const id = keys.join(",");
  const [prevId, setPrevId] = useState(id);
  if (id !== prevId) {
    setPrevId(id);
    setDraft({});
    setError(null);
  }

  const known = keys.filter((k) => FIELD_BY_KEY[k]);
  const base = me.data?.values ?? {};
  const values = { ...base, ...draft };
  const changed = known.filter((k) => draft[k] !== undefined && draft[k]!.trim() !== (base[k] ?? "").trim());
  const valid = changed.every((k) => isValidFieldValue(FIELD_BY_KEY[k]!, values[k]));
  const canSave = Boolean(me.data) && changed.length > 0 && valid && !saveProfile.isPending;

  return {
    keys: known,
    values,
    fillingFor: me.data?.fillingFor ?? "self",
    ready: Boolean(me.data),
    loadError: me.isError ? me.error : null,
    retryLoad: () => void me.refetch(),
    set: (key, value) => {
      setError(null);
      setDraft((d) => ({ ...d, [key]: value }));
    },
    error,
    canSave,
    saving: saveProfile.isPending,
    async save() {
      if (!canSave) return false;
      setError(null);
      try {
        await saveProfile.mutateAsync({ values: Object.fromEntries(changed.map((k) => [k, values[k]!.trim()])) });
        setDraft({});
        return true;
      } catch (err) {
        setError(errorMessage(err, "Save nahi ho paaya — dobara try karein."));
        return false;
      }
    },
  };
}

/** The questions themselves — the catalog's own wording and widgets (wheels, the time picker, the place list, chips). */
export function FieldsForm({ state }: { state: FieldsEditState }) {
  const t = useTheme();
  if (!state.ready) {
    return state.loadError ? (
      <View style={styles.center}>
        <Text variant="body" tone="secondary" center>
          {errorMessage(state.loadError)}
        </Text>
        <SecondaryButton label="Try Again" size="md" fullWidth={false} onPress={state.retryLoad} />
      </View>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator color={t.colors.gold} />
      </View>
    );
  }
  return (
    <View style={styles.stack}>
      {state.keys.map((key) => (
        <ProfileQuestion
          key={key}
          field={FIELD_BY_KEY[key]!}
          value={state.values[key] ?? ""}
          values={state.values}
          fillingFor={state.fillingFor}
          onChange={state.set}
          context="editor"
          bare
        />
      ))}
      {state.error ? (
        <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Icon icon={CircleAlert} size={16} tone="danger" />
          <Text variant="smallStrong" tone="danger" style={styles.flex}>
            {state.error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 22 },
  center: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 28 },
  error: { flexDirection: "row", alignItems: "center", gap: 8 },
});
