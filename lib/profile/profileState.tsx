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
import type { VoiceSelfFillStatus } from "@prisma/client";
import {
  completionPercent,
  currentStage,
  type ProfileValues,
} from "@/lib/profile/stages";
import {
  evaluateReadiness,
  lifecycleFor,
  type ProfileLifecycle,
  type ProfileReadiness,
  type ReadinessMetaMap,
} from "@/lib/profile/readiness";

/**
 * Profile draft state.
 *
 * M03 landed: `values` now syncs to a real `profiles` row via
 * `/api/profile/save-draft` (debounced) and hydrates from `/api/profile/me`
 * on mount. localStorage stays as the offline/first-paint cache exactly as
 * before — a logged-out visit, a flaky connection, or a save that hasn't
 * landed yet all still work, they just don't reach the server until one does.
 *
 * Per-field provenance (`meta` — who said it, how confident, in what words)
 * used to stop here, on the grounds that it was an interview-UI affordance
 * with no server-side reader. It now has three: Deep Profile must not treat an
 * unconfirmed AI inference as a fact, Marriage Intelligence distinguishes a
 * candidate's own words from their parent's, and "ye kahan se aaya?" should
 * survive clearing the browser cache. So `meta` and `fillingFor` ride along
 * with the same debounced save — only the entries that actually changed, so a
 * keystroke still costs one small request. See `provenanceService.ts`.
 *
 * Consumers of `useProfile()` are unchanged, as promised.
 */

const STORAGE_KEY = "bt-profile-draft";
/**
 * Which account's profile the cached draft belongs to. A shared/dev browser
 * logging into a second account must never inherit the first account's
 * in-progress answers — see the owner check in `hydrate` below.
 */
const OWNER_KEY = "bt-profile-draft-owner";

export type FieldSource = "user" | "ai" | "inferred";

/**
 * `saving` — a request is in flight. `saved` — the server acknowledged it.
 * `error` — it did not land (offline, 500, logged out). Nothing downstream may
 * render a success state while this is `error`; see §7's required states.
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

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

/**
 * The contract the Smart Profile Deck (and the manual long form) actually
 * depend on — deliberately exported.
 *
 * `ProfileProvider` below is one implementation: it autosaves into the
 * *signed-in user's own* profile. `ManagedProfileDraftProvider`
 * (lib/profile/managedDraftState.tsx) is a second: it autosaves into a private
 * managed draft belonging to somebody else entirely.
 *
 * Making this an interface with two implementations, rather than forking the
 * 1,100-line deck, is what keeps a partner filling a client draft on exactly
 * the same quick picks, cascades, wheels and card physics as a member filling
 * their own — and, more importantly, what makes it impossible for the two to
 * drift into different privacy behaviour. The deck reads `useProfile()` and
 * cannot tell which provider is above it; that is the point.
 */
export type ProfileContextValue = {
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
  /**
   * **Server-confirmed** activation, never a local guess.
   *
   * This used to be `isProfileLive(values)` — the client's own opinion of its
   * own draft — which meant a save that never reached the server still painted
   * the "aapki profile live hai" screen. It is now whatever the last successful
   * `/api/profile/me` or `/api/profile/save-draft` said, so an offline device
   * simply cannot claim a profile is live.
   *
   * For "the user has done their part", use `readiness.ready` instead.
   */
  live: boolean;
  /** The minimum gate, evaluated locally over values + provenance. */
  readiness: ProfileReadiness;
  /** empty / draft / needs_review / ready / live — see lib/profile/readiness.ts. */
  lifecycle: ProfileLifecycle;
  /** Honest autosave state. A failed save must be visible, not silent. */
  saveState: SaveState;
  /**
   * Push whatever is pending right now and wait for the answer. What "Abhi ke
   * liye save karein" and "Profile live karein" call — neither may report
   * success on the strength of a debounce timer that has not fired yet.
   * Resolves to the server's own live answer.
   */
  flushSave: () => Promise<{ ok: boolean; live: boolean }>;
  /** Self-fill voice access — see VoiceSelfFillStatus. Null until hydrated. */
  voiceSelfFillStatus: VoiceSelfFillStatus | null;
  /** Local update after a request/decision lands, without a full re-fetch. */
  setVoiceSelfFillStatus: (status: VoiceSelfFillStatus) => void;
};

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used inside <ProfileProvider> or <ManagedProfileDraftProvider>");
  }
  return ctx;
}

export { mergeMeta as mergeFieldMeta, EMPTY as EMPTY_PROFILE_DRAFT };

const SAVE_DEBOUNCE_MS = 900;

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY);
  // Rendering saved values before hydration would mismatch the server HTML,
  // so consumers wait on `ready` rather than flashing an empty form.
  const [ready, setReady] = useState(false);
  const [voiceSelfFillStatus, setVoiceSelfFillStatus] = useState<VoiceSelfFillStatus | null>(null);
  /** The server's own answer about activation — never computed here. */
  const [serverLive, setServerLive] = useState(false);
  /** Synchronous mirror, so a save that fires before a re-render still reports the truth. */
  const serverLiveRef = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSynced = useRef<string>("");
  /** fieldKey → the serialized `FieldMeta` last pushed, so only real changes go up. */
  const lastSyncedMeta = useRef<Record<string, string>>({});
  const lastSyncedFillingFor = useRef<FillingFor | null>(null);

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
          const body = (await res.json()) as {
            values?: ProfileValues;
            meta?: Record<string, FieldMeta>;
            fillingFor?: FillingFor;
            profileId?: string;
            isLive?: boolean;
            voiceSelfFillStatus?: VoiceSelfFillStatus;
          };
          if (!cancelled) {
            if (body.voiceSelfFillStatus) setVoiceSelfFillStatus(body.voiceSelfFillStatus);
            serverLiveRef.current = Boolean(body.isLive);
            setServerLive(Boolean(body.isLive));
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
            /*
             * Provenance from the server wins over the cached copy, for the
             * same reason values do — and for one more that matters more.
             *
             * The client used to hydrate values from the server and metadata
             * from localStorage alone. So clearing the cache, logging in on a
             * second device, or simply using a private window produced a draft
             * where every AI reading had *no* metadata at all — which
             * `needsHumanReview` reads as "a person typed this". An unchecked
             * biodata guess would then sail through the minimum gate on the
             * next autosave. Server-persisted provenance is what makes
             * "unconfirmed stays unconfirmed across a refresh" true.
             */
            if (body.meta && Object.keys(body.meta).length > 0) {
              local = { ...local, meta: { ...local.meta, ...body.meta } };
            }
            // Who is answering is a server fact too (`Profile.respondentType`),
            // so a resumed session asks the questions the right way round.
            if (body.fillingFor && Object.keys(local.values).length > 0) {
              local = { ...local, fillingFor: body.fillingFor };
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
        // Seeded, not left empty: the cached draft's provenance was already
        // pushed by whichever session wrote it, and re-sending all of it on
        // every page load would let a stale device overwrite a confirmation
        // made somewhere else. Only what changes from here goes up.
        lastSyncedMeta.current = Object.fromEntries(
          Object.entries(local.meta).map(([key, meta]) => [key, JSON.stringify(meta)]),
        );
        lastSyncedFillingFor.current = local.fillingFor;
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

  /**
   * The one place a draft reaches the server.
   *
   * Both the debounced autosave and `flushSave` go through this, so "did it
   * land?" has a single answer rather than two racing ones — and so the
   * server's own `isLive` is recorded on every successful push, which is what
   * `live` reports. A rejected or unreachable save leaves `saveState: "error"`
   * and `serverLive` untouched: the UI then cannot show a live screen for a
   * profile the server never activated.
   */
  const pushDraft = useCallback(
    async (d: ProfileDraft): Promise<{ ok: boolean; live: boolean }> => {
      const serialized = JSON.stringify(d.values);
      if (Object.keys(d.values).length === 0) return { ok: true, live: false };

      // Only the entries whose metadata moved. Sending the whole `meta` map on
      // every keystroke would turn one autosave into thirty upserts, almost all
      // of them writing back the value already stored.
      const changedMeta: Record<string, FieldMeta> = {};
      for (const [key, meta] of Object.entries(d.meta)) {
        if (JSON.stringify(meta) !== lastSyncedMeta.current[key]) changedMeta[key] = meta;
      }
      const fillingForChanged = d.fillingFor !== lastSyncedFillingFor.current;
      const valuesChanged = serialized !== lastSynced.current;
      if (!valuesChanged && Object.keys(changedMeta).length === 0 && !fillingForChanged) {
        return { ok: true, live: serverLiveRef.current };
      }

      setSaveState("saving");
      try {
        const res = await fetch("/api/profile/save-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: d.values,
            ...(Object.keys(changedMeta).length > 0 ? { meta: changedMeta } : {}),
            ...(fillingForChanged ? { fillingFor: d.fillingFor } : {}),
          }),
        });
        if (!res.ok) {
          setSaveState("error");
          return { ok: false, live: serverLiveRef.current };
        }
        // Marked synced only *after* the server said yes. Marking it before the
        // request (as this used to) meant a failed save was never retried — the
        // next keystroke saw "nothing changed" and skipped it.
        lastSynced.current = serialized;
        for (const [key, meta] of Object.entries(changedMeta)) {
          lastSyncedMeta.current[key] = JSON.stringify(meta);
        }
        lastSyncedFillingFor.current = d.fillingFor;

        const body = (await res.json()) as { isLive?: boolean };
        const live = Boolean(body.isLive);
        serverLiveRef.current = live;
        setServerLive(live);
        setSaveState("saved");
        return { ok: true, live };
      } catch {
        /* offline or logged out — localStorage already has this turn */
        setSaveState("error");
        return { ok: false, live: serverLiveRef.current };
      }
    },
    [],
  );

  const pushDraftRef = useRef(pushDraft);
  pushDraftRef.current = pushDraft;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Debounced autosave — values, plus whichever provenance actually changed
  // this turn (see the note above).
  useEffect(() => {
    if (!ready) return;
    if (Object.keys(draft.values).length === 0) return; // nothing to push yet, or just reset

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      void pushDraftRef.current(draftRef.current);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [draft.values, draft.meta, draft.fillingFor, ready]);

  /** Save now and wait. Used by every "I am done for today" exit. */
  const flushSave = useCallback(async () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    return pushDraftRef.current(draftRef.current);
  }, []);

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

  const value = useMemo<ProfileContextValue>(() => {
    // Same pure rule the server runs, over the same two inputs. Because it is
    // literally the same function, "server and client agree about live
    // readiness" is structural rather than a promise two files make each other.
    const readiness = evaluateReadiness(draft.values, draft.meta as ReadinessMetaMap);
    return {
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
      live: serverLive,
      readiness,
      lifecycle: lifecycleFor({
        readiness,
        hasAnyValue: Object.keys(draft.values).length > 0,
        activatedOnServer: serverLive,
      }),
      saveState,
      flushSave,
      voiceSelfFillStatus,
      setVoiceSelfFillStatus,
    };
  }, [
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
    serverLive,
    saveState,
    flushSave,
    voiceSelfFillStatus,
  ]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
