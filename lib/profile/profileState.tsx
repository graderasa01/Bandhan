"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FillingFor, SpokenLanguage } from "@/lib/contracts/interview";
import {
  completionPercent,
  currentStage,
  isProfileLive,
  type ProfileValues,
} from "@/lib/profile/stages";

/**
 * Profile draft state.
 *
 * M03 landed: `values` now syncs to a real `profiles` row via
 * `/api/profile/save-draft` (debounced) and hydrates from `/api/profile/me`
 * on mount. localStorage stays as the offline/first-paint cache exactly as
 * before — a logged-out visit, a flaky connection, or a save that hasn't
 * landed yet all still work, they just don't reach the server until one
 * does. Per-field provenance (`meta` — who said it, how confident, in what
 * words) stays client-only: it's an interview-UI affordance, not part of the
 * M03B schema, so it was never a candidate for the server sync in the first
 * place. Consumers of `useProfile()` are unchanged, as promised.
 */

const STORAGE_KEY = "bt-profile-draft";
/**
 * Which account's profile the cached draft belongs to. A shared/dev browser
 * logging into a second account must never inherit the first account's
 * in-progress answers — see the owner check in `hydrate` below.
 */
const OWNER_KEY = "bt-profile-draft-owner";

export type FieldSource = "user" | "ai" | "inferred";

export type FieldMeta = {
  source: FieldSource;
  confidence?: number;
  /** The user's own words this came from — "ye kahan se aaya?" */
  sourceSpan?: string;
  inferredFrom?: string;
  confirmed: boolean;
};

export type ProfileDraft = {
  values: ProfileValues;
  meta: Record<string, FieldMeta>;
  fillingFor: FillingFor;
  /** Fields the user chose to skip — the gap engine stops offering them. */
  skipped: string[];
  /** Language to ask and listen in. Persisted so a resume stays in it. */
  language: SpokenLanguage;
  /**
   * True once the user picked the language themselves. After that, detection
   * may *offer* a switch but must never perform one — silently overriding an
   * explicit choice because one word tripped a detector is how a user loses
   * the ability to set their own language.
   */
  languageChosen: boolean;
};

const EMPTY: ProfileDraft = {
  values: {},
  meta: {},
  fillingFor: "self",
  skipped: [],
  language: "hi",
  languageChosen: false,
};

/**
 * Explicit merge rather than a spread chain: a value written by hand must be
 * able to clear an AI confidence badge, and a spread whose order is easy to
 * get backwards is how a rejected suggestion keeps vouching for itself.
 */
function mergeMeta(prev: FieldMeta | undefined, next: Partial<FieldMeta> | undefined): FieldMeta {
  return {
    source: next?.source ?? prev?.source ?? "user",
    confirmed: next?.confirmed ?? prev?.confirmed ?? true,
    confidence: next?.confidence ?? prev?.confidence,
    sourceSpan: next?.sourceSpan ?? prev?.sourceSpan,
    inferredFrom: next?.inferredFrom ?? prev?.inferredFrom,
  };
}

type ProfileContextValue = {
  draft: ProfileDraft;
  ready: boolean;
  setValue: (key: string, value: string, meta?: Partial<FieldMeta>) => void;
  setValues: (entries: { key: string; value: string; meta?: Partial<FieldMeta> }[]) => void;
  confirmField: (key: string) => void;
  /** Hand correction — replaces provenance rather than merging into it. */
  editField: (key: string, value: string) => void;
  clearField: (key: string) => void;
  skipField: (key: string) => void;
  setFillingFor: (who: FillingFor) => void;
  /** `chosen` marks a deliberate pick, which detection may no longer override. */
  setLanguage: (lang: SpokenLanguage, chosen: boolean) => void;
  reset: () => void;
  completion: number;
  stage: ReturnType<typeof currentStage>;
  live: boolean;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside <ProfileProvider>");
  return ctx;
}

const SAVE_DEBOUNCE_MS = 900;

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY);
  // Rendering saved values before hydration would mismatch the server HTML,
  // so consumers wait on `ready` rather than flashing an empty form.
  const [ready, setReady] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSynced = useRef<string>("");

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let local: ProfileDraft = EMPTY;
      let storedOwner: string | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) local = { ...EMPTY, ...(JSON.parse(raw) as ProfileDraft) };
        storedOwner = localStorage.getItem(OWNER_KEY);
      } catch {
        /* corrupt draft — start clean rather than trapping the user */
      }

      // Server wins on a key both sides have; a value only saved locally
      // (offline, or logged out) survives until the next sync reaches it.
      try {
        const res = await fetch("/api/profile/me");
        if (res.ok) {
          const body = (await res.json()) as { values?: ProfileValues; profileId?: string };
          if (!cancelled) {
            // The cached draft was tagged with whichever account last synced
            // it. A different profileId now means a different account logged
            // in on this browser — the old draft is theirs, not this one's,
            // and merging it in would both show it on screen and, once the
            // debounced autosave fires, write it into this account's real row.
            if (storedOwner && body.profileId && storedOwner !== body.profileId) {
              local = EMPTY;
            }
            if (body.values) {
              local = { ...local, values: { ...local.values, ...body.values } };
            }
            if (body.profileId) {
              try {
                localStorage.setItem(OWNER_KEY, body.profileId);
              } catch {
                /* private mode / quota — owner tag just won't persist */
              }
            }
          }
        }
        // 401 (logged out) is expected on public views of this provider —
        // the local draft is simply what there is until login.
      } catch {
        /* offline — local draft is the source of truth for this session */
      }

      if (!cancelled) {
        lastSynced.current = JSON.stringify(local.values);
        setDraft(local);
        setReady(true);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* private mode / quota — the session still works, it just won't resume */
    }
  }, [draft, ready]);

  // Debounced push to the server — values only, per the note above.
  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(draft.values);
    if (serialized === lastSynced.current) return;
    if (Object.keys(draft.values).length === 0) return; // nothing to push yet, or just reset

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      lastSynced.current = serialized;
      fetch("/api/profile/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized.length > 0 ? `{"values":${serialized}}` : undefined,
      }).catch(() => {
        /* offline or logged out — localStorage already has this turn, next change retries */
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [draft.values, ready]);

  const setValue = useCallback((key: string, value: string, meta?: Partial<FieldMeta>) => {
    setDraft((d) => ({
      ...d,
      values: { ...d.values, [key]: value },
      meta: { ...d.meta, [key]: mergeMeta(d.meta[key], meta) },
    }));
  }, []);

  const setValues = useCallback(
    (entries: { key: string; value: string; meta?: Partial<FieldMeta> }[]) => {
      if (entries.length === 0) return;
      setDraft((d) => {
        const values = { ...d.values };
        const meta = { ...d.meta };
        for (const e of entries) {
          values[e.key] = e.value;
          meta[e.key] = mergeMeta(meta[e.key], e.meta);
        }
        return { ...d, values, meta };
      });
    },
    [],
  );

  const confirmField = useCallback((key: string) => {
    setDraft((d) => ({
      ...d,
      meta: { ...d.meta, [key]: { ...(d.meta[key] ?? { source: "user", confirmed: false }), confirmed: true } },
    }));
  }, []);

  /**
   * A hand correction, which *replaces* provenance instead of merging into it.
   *
   * `setValue` merges, so passing `confidence: undefined` there falls through to
   * the old number and the previous `sourceSpan` survives — leaving a corrected
   * value still quoting the sentence that produced the wrong one. Editing has to
   * wipe the AI's fingerprints, not inherit them.
   */
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
      // Provenance dies with the value, or the badge would keep vouching for
      // something the user rejected.
      delete values[key];
      delete meta[key];
      return { ...d, values, meta };
    });
  }, []);

  const skipField = useCallback((key: string) => {
    setDraft((d) => (d.skipped.includes(key) ? d : { ...d, skipped: [...d.skipped, key] }));
  }, []);

  const setFillingFor = useCallback((who: FillingFor) => {
    setDraft((d) => {
      // Choosing "bete ke liye" / "beti ke liye" has already answered gender.
      // Letting the extractor re-derive it means that on the turns it happens
      // to miss, the very next screen asks "beta hai ya beti?" — a question
      // the user just answered, which reads as not listening. Code knows this
      // one; the model is not needed for it.
      const implied = who === "son" ? "Ladka" : who === "daughter" ? "Ladki" : null;
      if (!implied) {
        // Switching to "apne liye" invalidates an inference made for a child.
        const values = { ...d.values };
        const meta = { ...d.meta };
        delete values.gender;
        delete meta.gender;
        return { ...d, fillingFor: who, values, meta };
      }
      return {
        ...d,
        fillingFor: who,
        values: { ...d.values, gender: implied },
        meta: { ...d.meta, gender: { source: "user", confirmed: true } },
      };
    });
  }, []);

  const setLanguage = useCallback((lang: SpokenLanguage, chosen: boolean) => {
    setDraft((d) => {
      // A detector result never overrides a language the user picked.
      if (!chosen && d.languageChosen) return d;
      const nextChosen = chosen || d.languageChosen;
      if (d.language === lang && d.languageChosen === nextChosen) return d;
      return { ...d, language: lang, languageChosen: nextChosen };
    });
  }, []);

  /**
   * Clears storage synchronously as well as state, so a caller can reload
   * straight after without racing the persist effect. Callers reload rather than
   * just re-render, because phase, miss counters and the translation cache all
   * live outside this draft and would otherwise survive a "start over".
   */
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode — state reset below is still the source of truth */
    }
    setDraft(EMPTY);
  }, []);

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
    }),
    [
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
    ],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
