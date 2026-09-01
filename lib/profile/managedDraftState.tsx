"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FillingFor, SpokenLanguage } from "@/lib/contracts/interview";
import {
  EMPTY_PROFILE_DRAFT,
  ProfileContext,
  mergeFieldMeta,
  type FieldMeta,
  type ProfileContextValue,
  type ProfileDraft,
} from "@/lib/profile/profileState";
import { completionPercent, currentStage, isProfileLive } from "@/lib/profile/stages";

/**
 * The second implementation of `ProfileContextValue` — the one that drives the
 * Smart Profile Deck when a partner or a parent is filling in a draft **for
 * somebody else**.
 *
 * It exists to make one specific accident impossible. `ProfileProvider`
 * autosaves to `/api/profile/save-draft`, which writes the *signed-in user's
 * own* profile. Mounting the deck for a partner without changing that would
 * mean every tap on a client's card silently overwrote the partner's own
 * profile — the single most damaging bug this feature could ship, and one that
 * would look like it was working right up until the partner opened their own
 * page.
 *
 * So this provider:
 *
 *  - posts only to `/api/managed-profile/drafts/{id}/fields`, and contains no
 *    reference to `/api/profile/save-draft` at all;
 *  - hydrates only from the managed draft;
 *  - **keeps nothing in localStorage.** `ProfileProvider` caches its draft
 *    there so an offline member does not lose answers, which is right for your
 *    own data and wrong for a client's: a marriage bureau's shared laptop
 *    would accumulate other people's dates of birth and incomes in a browser
 *    store nobody ever clears. The cost is that a managed draft needs a
 *    connection to save — the correct trade for third-party data;
 *  - reports `saveState` so the deck's host can show "saving…" / "save
 *    failed", since without a local cache a failed save is a real loss and has
 *    to be visible rather than assumed.
 *
 * Everything the deck reads — values, meta, fillingFor, completion, stage,
 * live — has the same shape and the same meaning as in the owner's case.
 */

const SAVE_DEBOUNCE_MS = 700;

export type ManagedSaveState = "idle" | "saving" | "saved" | "error";

interface ManagedDraftProviderProps {
  draftId: string;
  /** "Ladka" | "Ladki" — decides the deck's `questionForChild` voice. */
  fillingForGender: string;
  children: ReactNode;
  onSaveStateChange?: (state: ManagedSaveState) => void;
}

/** A managed draft is never "self" — that is the whole reason it exists. */
function fillingForFrom(gender: string): FillingFor {
  return gender === "Ladka" ? "son" : "daughter";
}

export function ManagedProfileDraftProvider({
  draftId,
  fillingForGender,
  children,
  onSaveStateChange,
}: ManagedDraftProviderProps) {
  const [draft, setDraft] = useState<ProfileDraft>({
    ...EMPTY_PROFILE_DRAFT,
    fillingFor: fillingForFrom(fillingForGender),
  });
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<ManagedSaveState>("idle");

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** fieldKey → serialized {value, meta} last accepted by the server. */
  const lastSynced = useRef<Record<string, string>>({});
  const pending = useRef<Record<string, { value: string; meta: FieldMeta }>>({});

  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [saveState, onSaveStateChange]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const res = await fetch(`/api/managed-profile/drafts/${draftId}`);
        if (res.ok) {
          const body = (await res.json()) as {
            values?: Record<string, string>;
            meta?: Record<string, FieldMeta>;
          };
          if (!cancelled) {
            const values = body.values ?? {};
            const meta = body.meta ?? {};
            lastSynced.current = Object.fromEntries(
              Object.entries(values).map(([k, v]) => [k, JSON.stringify({ v, m: meta[k] ?? null })]),
            );
            setDraft((d) => ({ ...d, values, meta }));
          }
        }
      } catch {
        /* offline — the deck opens empty and the first save will report the failure */
      }
      if (!cancelled) setReady(true);
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = {};
    const keys = Object.keys(batch);
    if (keys.length === 0) return;

    setSaveState("saving");
    try {
      const res = await fetch(`/api/managed-profile/drafts/${draftId}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: Object.fromEntries(
            keys.map((k) => [
              k,
              {
                value: batch[k].value,
                source: batch[k].meta.source,
                sourceContext: batch[k].meta.sourceSpan ?? batch[k].meta.inferredFrom,
                confidence: batch[k].meta.confidence,
              },
            ]),
          ),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      for (const k of keys) {
        lastSynced.current[k] = JSON.stringify({ v: batch[k].value, m: batch[k].meta });
      }
      setSaveState("saved");
    } catch {
      // Put the batch back so the next change retries it — without a local
      // cache this is the only thing standing between a flaky connection and
      // a lost answer.
      pending.current = { ...batch, ...pending.current };
      setSaveState("error");
    }
  }, [draftId]);

  useEffect(() => {
    if (!ready) return;

    for (const [key, value] of Object.entries(draft.values)) {
      const meta = draft.meta[key] ?? { source: "user" as const, confirmed: true };
      const serialized = JSON.stringify({ v: value, m: meta });
      if (lastSynced.current[key] === serialized) continue;
      pending.current[key] = { value, meta };
    }
    // A cleared field is a real edit — an empty value tells the server to drop
    // the proposal rather than leave a stale one behind.
    for (const key of Object.keys(lastSynced.current)) {
      if (!(key in draft.values) && !(key in pending.current)) {
        pending.current[key] = { value: "", meta: { source: "user", confirmed: true } };
      }
    }

    if (Object.keys(pending.current).length === 0) return;

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      void flush();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [draft.values, draft.meta, ready, flush]);

  const setValue = useCallback((key: string, value: string, meta?: Partial<FieldMeta>) => {
    setDraft((d) => ({
      ...d,
      values: { ...d.values, [key]: value },
      meta: { ...d.meta, [key]: mergeFieldMeta(d.meta[key], meta) },
    }));
  }, []);

  const setValues = useCallback((entries: { key: string; value: string; meta?: Partial<FieldMeta> }[]) => {
    if (entries.length === 0) return;
    setDraft((d) => {
      const values = { ...d.values };
      const meta = { ...d.meta };
      for (const e of entries) {
        values[e.key] = e.value;
        meta[e.key] = mergeFieldMeta(meta[e.key], e.meta);
      }
      return { ...d, values, meta };
    });
  }, []);

  const confirmField = useCallback((key: string) => {
    // A helper confirming their own typing means "I am sure I typed this
    // right" — never "the owner agreed". Owner confirmation lives in
    // `ownerReviewService` and cannot be reached from this provider at all.
    setDraft((d) => ({
      ...d,
      meta: { ...d.meta, [key]: { ...(d.meta[key] ?? { source: "user", confirmed: false }), confirmed: true } },
    }));
  }, []);

  const editField = useCallback((key: string, value: string) => {
    setDraft((d) => ({
      ...d,
      values: { ...d.values, [key]: value },
      meta: { ...d.meta, [key]: { source: "user", confirmed: true } },
    }));
  }, []);

  const clearField = useCallback((key: string) => {
    setDraft((d) => {
      const values = { ...d.values };
      const meta = { ...d.meta };
      delete values[key];
      delete meta[key];
      return { ...d, values, meta };
    });
  }, []);

  const skipField = useCallback((key: string) => {
    setDraft((d) => (d.skipped.includes(key) ? d : { ...d, skipped: [...d.skipped, key] }));
  }, []);

  /**
   * Deliberately inert. "Kis ke liye bhar rahe hain" was answered when the
   * draft was created and is stored on the server row; letting the deck change
   * it here would let a helper silently repoint a draft at a different person
   * mid-fill, with all the answers already in it.
   */
  const setFillingFor = useCallback<ProfileContextValue["setFillingFor"]>(() => {}, []);

  const setLanguage = useCallback((lang: SpokenLanguage, chosen: boolean) => {
    setDraft((d) => {
      if (!chosen && d.languageChosen) return d;
      const nextChosen = chosen || d.languageChosen;
      if (d.language === lang && d.languageChosen === nextChosen) return d;
      return { ...d, language: lang, languageChosen: nextChosen };
    });
  }, []);

  /** No-op: "start over" on somebody else's data is a destructive server
   *  action, not a client state reset. The creator cancels the draft instead. */
  const reset = useCallback(() => {}, []);

  const value = useMemo<ProfileContextValue>(
    () => ({
      draft,
      ready,
      setValue,
      setValues,
      confirmField,
      editField,
      clearField,
      skipField,
      setFillingFor,
      setLanguage,
      reset,
      completion: completionPercent(draft.values),
      stage: currentStage(draft.values),
      live: isProfileLive(draft.values),
      // Voice self-fill is an entitlement on a *member's own* account; it has
      // no meaning for a draft about somebody else, so the deck sees null and
      // simply never offers it.
      voiceSelfFillStatus: null,
      setVoiceSelfFillStatus: () => {},
    }),
    [draft, ready, setValue, setValues, confirmField, editField, clearField, skipField, setFillingFor, setLanguage, reset],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
