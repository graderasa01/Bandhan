import { useState } from "react";
import { BottomSheet, PrimaryButton } from "~/components";
import { FIELD_BY_KEY, isValidFieldValue } from "~/catalog";
import { ProfileQuestion, type QuestionContext } from "~/features/profile-setup/inputs/FieldEditor";
import type { FillingFor } from "~/types/api";

/**
 * A quick edit of one profile field in a glass sheet — the standard way a
 * single answer is changed anywhere in the app (Bolo's review, the profile
 * card, a dashboard prompt). The question and its input are `ProfileQuestion`
 * (the catalog's own); the answer is only handed to `onSave` once it is a
 * value the field accepts, and the caller stores it on its one path.
 */
export function ProfileFieldSheet({
  fieldKey,
  visible,
  value,
  values,
  fillingFor,
  context = "editor",
  onClose,
  onSave,
}: {
  fieldKey: string | null;
  visible: boolean;
  value: string;
  values: Record<string, string>;
  fillingFor: FillingFor;
  context?: QuestionContext;
  onClose: () => void;
  onSave: (key: string, value: string) => void | Promise<void>;
}) {
  const field = fieldKey ? FIELD_BY_KEY[fieldKey] : undefined;
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  // Opened (again, or for another field): it starts from the value it was given.
  const opening = visible ? JSON.stringify([fieldKey, value]) : null;
  const [openedFor, setOpenedFor] = useState(opening);
  if (opening !== openedFor) {
    setOpenedFor(opening);
    if (opening !== null) setDraft(value);
  }

  if (!field) return null;
  const valid = isValidFieldValue(field, draft);
  const changed = draft.trim() !== value.trim();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={field.label}
      footer={
        <PrimaryButton
          label="Save"
          disabled={!valid || !changed}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onSave(field.key, draft.trim());
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <ProfileQuestion
        field={field}
        value={draft}
        values={{ ...values, [field.key]: draft }}
        fillingFor={fillingFor}
        onChange={(_, v) => setDraft(v)}
        context={context}
        bare
        showRequired
      />
    </BottomSheet>
  );
}
