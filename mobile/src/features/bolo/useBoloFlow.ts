import { router } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { boloService, type BoloBoot } from "~/services/bolo";
import { authService } from "~/services/auth";
import { ai } from "~/services/ai";
import { useSession } from "~/store/session";
import { boloGuestKickoff, boloMemberKickoff } from "~/shared/bolo/agent";
import {
  MINIMUM_LIVE_KEYS,
  acceptAnswers,
  acceptPreferences,
  emptyDraft,
  isBoloPreferenceKey,
  isFillingFor,
  labelsFor,
  missingMinimum,
  missingPreferences,
  normalizeAnswer,
  preferenceValues,
  type BoloDraft,
  type BoloPreferenceKey,
  type BoloValues,
} from "~/shared/bolo/draft";
import {
  FILLING_FOR_ASK,
  askFor,
  detectAskedField,
  impliedGender,
  isPreferenceAsk,
  pendingAskKeys,
  readFillingFor,
  readTypedValue,
} from "~/shared/bolo/questions";
import { PASSWORD_MIN_LENGTH, isAcceptablePassword } from "~/shared/passwordPolicy";
import { FIELD_BY_KEY } from "~/catalog/fields";
import type { FieldMeta, FillingFor } from "~/types/api";
import { haptics } from "~/utils/haptics";
import { memberStartDraft, readStoredDraft, removeStoredDraft, storageKeyFor, writeStoredDraft } from "./storage";
import { createLiveSession, isLiveVoiceSupported } from "./voice/liveSession";
import type { LiveEvent, LiveFailure, LiveSession, LiveStatus, ToolCallRequest } from "./voice/types";

/**
 * The native form of the web's `/bolo` (components/bolo/BoloExperience.tsx):
 * one conversation, no long form. Grio asks the eight questions a live
 * profile needs (then the two first-sitting preferences); each is answered by
 * voice, a tap or typing, the profile card fills as answers are accepted, the
 * full card becomes the review, and — for a visitor — only then a number, a
 * code and the account.
 *
 * Everything that *judges* an answer is the web's own code, copied verbatim
 * into `src/shared/` (the draft's `acceptAnswers`, the question ladder, the
 * chips, Grio's brief): the same answer is accepted or refused here as on the
 * web, and the server re-checks it all anyway.
 *
 * ## Who owns what (unchanged from the web)
 *
 *   - **The model** owns the conversation: what to ask next, in which words.
 *   - **This hook** owns the draft. Every tool Grio calls runs here, against
 *     `draftRef`, and the model only ever learns what was accepted.
 *   - **The server** owns the truth: `/api/bolo/complete` re-validates every
 *     value and is the only thing that can say "live".
 *
 * ## What the app adds
 *
 * A member's answers also reach their profile as they are given
 * (`boloService.autosave`, `activate: false`), so "Open Full Form" halfway
 * shows them — without going live before the review, which stays the one
 * door to live, exactly as on the web. A tapped or typed answer is saved as
 * the member's own; one Grio heard is saved as a model's reading until the
 * review confirms it (the server's provenance rule, `needsHumanReview`).
 */

export type Stage = "start" | "talking" | "review" | "contact" | "done";
export type Done = { live: boolean; existingAccount: boolean; hasPassword: boolean };
type AnswerSource = "voice" | "chip" | "typed" | "edit";
export type Latest =
  | { id: number; kind: "accepted"; source: AnswerSource; fillingFor: FillingFor | null; keys: string[]; values: BoloValues }
  | { id: number; kind: "sent"; text: string };

export type OtpPhase = "enter" | "sent" | "skipped" | "verified";
export interface OtpState {
  phase: OtpPhase;
  masked: string | null;
  existingUser: boolean;
  error: string | null;
  cooldown: number;
}

/** How long an answered question stays up before the next one slides in — long enough for its ✓ to land. */
export const ACK_MS = 720;
/** After `go_next`, how long Grio gets for her one-word goodbye before the screen leaves regardless. */
const GOODBYE_GRACE_MS = 3500;
/** A member's answers wait this long for the next one before going to the server together. */
const AUTOSAVE_MS = 900;
/** The one word beside Grio's name after an answer lands. Taken in turn, never at random. */
const ACK_WORDS = ["Badhiya", "Theek hai", "Noted", "Shukriya"] as const;
const WHO_NOTE: Record<FillingFor, string> = { self: "apne liye", son: "bete ke liye", daughter: "beti ke liye" };

/** The screen writes its notes to the model in square brackets, so text a person typed never carries any in. */
function unbracket(text: string): string {
  return text.replace(/[[\]]/g, "");
}

export function failureCopy(failure: LiveFailure): string {
  switch (failure) {
    case "mic_denied":
      return "Mic ki permission nahi mili — tap karke ya likh kar bharein, ya settings me mic allow karein.";
    case "not_configured":
    case "disabled":
      return "Voice abhi uplabdh nahi hai — tap karke ya likh kar bharein.";
    case "rate_limited":
      return "Abhi bahut koshishein ho gayi — thodi der baad phir try karein, ya likh kar bharein.";
    case "unsupported":
      return "Is phone par live voice nahi chal payi — tap karke ya likh kar bharein.";
    case "session_changed":
      return "Login badal gaya lagta hai — screen dobara kholkar phir shuru kijiye.";
    default:
      return "Grio se connect nahi ho paya — phir try karein ya likh kar bharein.";
  }
}

export function useBoloFlow(boot: BoloBoot | null) {
  const member = boot?.member ?? null;
  const channels = boot?.channels ?? { mobile: false, email: false };

  const [draft, setDraft] = useState<BoloDraft>(emptyDraft);
  const draftRef = useRef(draft);
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<Stage>("start");
  const stageRef = useRef(stage);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [level, setLevel] = useState(0);
  const [userNow, setUserNow] = useState("");
  const [grioNow, setGrioNow] = useState("");
  const [highlight, setHighlight] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [contact, setContact] = useState("");
  const [accountName, setAccountName] = useState("");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState<OtpState>({ phase: "enter", masked: null, existingUser: false, error: null, cooldown: 0 });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [heroKey, setHeroKey] = useState<string | null>(null);
  const [voiceFocus, setVoiceFocus] = useState<string | null>(null);
  const [skippedPrefs, setSkippedPrefs] = useState<string[]>([]);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{ key: string; heard: string } | null>(null);
  const [muted, setMuted] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [composerHint, setComposerHint] = useState<string | null>(null);
  /** Asks the screen to put the keyboard on the composer (a "+ Doosra shehar" chip). */
  const [focusComposer, setFocusComposer] = useState(0);

  const sessionRef = useRef<LiveSession | null>(null);
  const contactRef = useRef(contact);
  const accountNameRef = useRef(accountName);
  const proofRef = useRef<string | null>(null);
  const otpRef = useRef(otp);
  const accountPasswordRef = useRef(accountPassword);
  const newPasswordRef = useRef(newPassword);
  const passwordSavedRef = useRef(passwordSaved);
  const userBuf = useRef("");
  const grioBuf = useRef("");
  const finishedRef = useRef(false);
  const doneRef = useRef<Done | null>(null);
  const leavingRef = useRef(false);
  const navigatedRef = useRef(false);
  const goodbyeHeardRef = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroKeyRef = useRef(heroKey);
  const skippedPrefsRef = useRef(skippedPrefs);
  const mutedRef = useRef(false);
  const answerSeq = useRef(0);
  const ackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A member's answers not yet on the server: key → how it was given. */
  const unsaved = useRef<Map<string, FieldMeta>>(new Map());
  const whoUnsaved = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // What the callbacks (tools, timers, the socket) read as "now": synced as
  // soon as a render commits — before any event or timer can run — and never
  // written during render, which may be thrown away.
  useLayoutEffect(() => {
    stageRef.current = stage;
    contactRef.current = contact;
    accountNameRef.current = accountName;
    otpRef.current = otp;
    accountPasswordRef.current = accountPassword;
    newPasswordRef.current = newPassword;
    passwordSavedRef.current = passwordSaved;
    heroKeyRef.current = heroKey;
    skippedPrefsRef.current = skippedPrefs;
  });

  const storageKey = storageKeyFor(member);
  const voiceSupported = useMemo(() => Boolean(boot?.voiceAvailable) && isLiveVoiceSupported(), [boot?.voiceAvailable]);
  const liveActive = liveStatus === "connecting" || liveStatus === "listening" || liveStatus === "speaking";
  const missing = useMemo(() => missingMinimum(draft.values), [draft.values]);
  const isComplete = missing.length === 0;
  const savedPreferences = useMemo(() => preferenceValues(draft.values), [draft.values]);
  const conversing = stage === "start" || stage === "talking";
  const pending = useMemo(
    () => pendingAskKeys(draft.fillingFor, draft.values, skippedPrefs),
    [draft.fillingFor, draft.values, skippedPrefs],
  );
  const focus = voiceFocus !== null && pending.includes(voiceFocus) ? voiceFocus : null;
  const targetKey = conversing ? (focus ?? pending[0] ?? null) : null;

  /* ---------------------------- persistence --------------------------- */

  // Once, when the server has said who is here: the member's profile (plus
  // anything answered on this phone), or the visitor's stored draft.
  useEffect(() => {
    if (!boot || hydrated) return;
    let cancelled = false;
    void (async () => {
      const stored = member ? await memberStartDraft(member) : ((await readStoredDraft(storageKeyFor(null))) ?? emptyDraft());
      if (cancelled) return;
      draftRef.current = stored;
      setDraft(stored);
      const pendingNow = pendingAskKeys(stored.fillingFor, stored.values);
      if (pendingNow.length === 0) {
        setStage("review");
      } else {
        if (!member && Object.keys(stored.values).length > 0) setStage("talking");
        setHeroKey(pendingNow[0] ?? null);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // `boot` arrives once per mount; re-running would throw away every answer given since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot]);

  useEffect(() => {
    // Once the profile exists the server has it; nothing left to keep here.
    if (!hydrated || finishedRef.current) return;
    void writeStoredDraft(storageKey, draft);
  }, [draft, hydrated, storageKey]);

  useEffect(() => {
    if (otp.cooldown <= 0) return;
    const timer = setTimeout(() => setOtp((o) => ({ ...o, cooldown: o.cooldown - 1 })), 1000);
    return () => clearTimeout(timer);
  }, [otp.cooldown]);

  /* --------------------------- member autosave -------------------------- */

  const flushAutosave = useCallback(async (): Promise<boolean> => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (!member || finishedRef.current) return true;
    if (unsaved.current.size === 0 && !whoUnsaved.current) return true;
    const entries = [...unsaved.current.entries()];
    const values = Object.fromEntries(entries.map(([key]) => [key, draftRef.current.values[key] ?? ""]));
    const meta = Object.fromEntries(entries);
    const sendWho = whoUnsaved.current ? draftRef.current.fillingFor : null;
    unsaved.current = new Map();
    whoUnsaved.current = false;
    try {
      await boloService.autosave(values, meta, sendWho);
      return true;
    } catch {
      // Put them back for the next try; the phone's own copy has them meanwhile.
      for (const [key, m] of entries) if (!unsaved.current.has(key)) unsaved.current.set(key, m);
      if (sendWho) whoUnsaved.current = true;
      return false;
    }
  }, [member]);

  const queueAutosave = useCallback(
    (keys: string[], source: AnswerSource, who = false) => {
      if (!member || finishedRef.current) return;
      // Heard by Grio is a model's reading until the review confirms it; tapped, typed or edited is the member's own.
      const meta: FieldMeta = source === "voice" ? { source: "ai", confirmed: false } : { source: "user", confirmed: true };
      for (const key of keys) unsaved.current.set(key, meta);
      if (who) whoUnsaved.current = true;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => void flushAutosave(), AUTOSAVE_MS);
    },
    [flushAutosave, member],
  );

  // Going to the background is the last reliable moment a phone gives. A live
  // conversation ends there too: a backgrounded app gets no microphone (iOS,
  // Android 9+), so Grio would go on talking to nobody with the socket open.
  // Every answer is already on the card; Reconnect picks up from it.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flushAutosave();
      if (state === "background") sessionRef.current?.stop("background");
    });
    return () => sub.remove();
  }, [flushAutosave]);

  useEffect(
    () => () => {
      sessionRef.current?.stop("user");
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (ackTimer.current) clearTimeout(ackTimer.current);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      void flushAutosave();
    },
    [flushAutosave],
  );

  /* ------------------------------ draft ------------------------------- */

  const commitDraft = useCallback((next: BoloDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  /**
   * Compare the draft with how it was before an answer and, when something
   * really changed, make that the bubble (and a member's next autosave). A
   * tool call that saves the same value again changes nothing — no second
   * bubble, no second acknowledgement, no second save.
   */
  const noteAccepted = useCallback(
    (before: BoloDraft, source: AnswerSource) => {
      const after = draftRef.current;
      const keys = Object.keys(after.values).filter((key) => after.values[key] !== before.values[key]);
      const cleared = Object.keys(before.values).filter((key) => before.values[key] && !after.values[key]);
      const who = after.fillingFor !== null && after.fillingFor !== before.fillingFor ? after.fillingFor : null;
      if (keys.length === 0 && cleared.length === 0 && who === null) return;
      queueAutosave([...keys, ...cleared], source, who !== null);
      const shown = keys.filter((key) => Boolean(after.values[key]));
      if (shown.length === 0 && who === null) return;
      const id = ++answerSeq.current;
      setLatest({ id, kind: "accepted", source, fillingFor: who, keys: shown, values: after.values });
      if (source === "edit") return;
      setAck(ACK_WORDS[id % ACK_WORDS.length] ?? "Badhiya");
      if (ackTimer.current) clearTimeout(ackTimer.current);
      ackTimer.current = setTimeout(() => setAck(null), ACK_MS + 600);
    },
    [queueAutosave],
  );

  const flash = useCallback((keys: string[]) => {
    setHighlight(keys);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight([]), 1400);
  }, []);

  const applyAnswers = useCallback(
    (incoming: Record<string, unknown>) => {
      const result = acceptAnswers(draftRef.current.values, incoming);
      // A corrected answer is no longer the reviewed one.
      const confirmed = result.saved.length > 0 ? false : draftRef.current.confirmed;
      commitDraft({ ...draftRef.current, values: result.values, confirmed, updatedAt: Date.now() });
      if (result.saved.length > 0) {
        flash(result.saved);
        haptics.tap();
      }
      return result;
    },
    [commitDraft, flash],
  );

  /** The two optional preferences — only those two keys, only into the draft. */
  const applyPreferences = useCallback(
    (incoming: Record<string, unknown>) => {
      const result = acceptPreferences(draftRef.current.values, incoming);
      if (result.saved.length > 0) {
        commitDraft({ ...draftRef.current, values: result.values, updatedAt: Date.now() });
        flash(result.saved);
        haptics.tap();
      }
      return result;
    },
    [commitDraft, flash],
  );

  const setWho = useCallback(
    (who: FillingFor) => {
      const current = draftRef.current;
      // "Bete ke liye" / "beti ke liye" has already answered gender; switching
      // back to "apne liye" drops only a gender that choice had filled in.
      const implied = impliedGender(who);
      const previous = impliedGender(current.fillingFor);
      const values: BoloValues = { ...current.values };
      if (implied) values.gender = implied;
      else if (previous && values.gender === previous) delete values.gender;
      const genderChanged = values.gender !== current.values.gender;
      commitDraft({ ...current, fillingFor: who, values, confirmed: genderChanged ? false : current.confirmed, updatedAt: Date.now() });
    },
    [commitDraft],
  );

  const editField = useCallback(
    (key: string, value: string) => {
      const before = draftRef.current;
      const normalized = normalizeAnswer(key, value);
      const next: BoloDraft = { ...before, values: { ...before.values, [key]: normalized }, confirmed: false, updatedAt: Date.now() };
      if (!normalized) delete next.values[key];
      commitDraft(next);
      if (normalized) flash([key]);
      noteAccepted(before, "edit");
      sessionRef.current?.sendText(`[User ne screen par ${key} badla: "${unbracket(normalized) || "(khaali)"}"]`);
    },
    [commitDraft, flash, noteAccepted],
  );

  const preferencesLeft = useCallback((): BoloPreferenceKey[] => {
    const values = draftRef.current.values;
    if (missingMinimum(values).length > 0) return [];
    return missingPreferences(values).filter((key) => !skippedPrefsRef.current.includes(key));
  }, []);

  const nextAfterContact = useCallback((): "preferences" | "finish" => (preferencesLeft().length > 0 ? "preferences" : "finish"), [
    preferencesLeft,
  ]);

  /** Whether a code can reach this contact at all — its own channel, not "is any OTP configured". */
  const canSendCodeTo = useCallback((raw: string) => (raw.includes("@") ? channels.email : channels.mobile), [channels.email, channels.mobile]);

  /* ------------------------------ leaving ----------------------------- */

  const leaveNow = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    sessionRef.current?.stop("finished");
    sessionRef.current = null;
    // Live: straight to the reel. Saved but not live: the anchor route, which
    // brings a (now signed-in) member back here to finish the rest.
    router.replace(doneRef.current?.live ? "/reels" : "/");
  }, []);

  const beginLeaving = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    const session = sessionRef.current;
    if (!session || session.currentStatus === "closed" || session.currentStatus === "idle") {
      leaveNow();
      return;
    }
    session.setMuted(true);
    leaveTimer.current = setTimeout(leaveNow, GOODBYE_GRACE_MS);
  }, [leaveNow]);

  /* ------------------------------ network ------------------------------ */

  const sendOtp = useCallback(async (rawContact: string) => {
    setBusy(true);
    try {
      const result = await boloService.sendOtp(rawContact);
      if (result.status === "sent") {
        setOtp({ phase: "sent", masked: result.masked, existingUser: result.existingUser, error: null, cooldown: 60 });
        setCode("");
      } else if (result.status === "skipped") {
        setOtp((o) => ({ ...o, phase: "skipped", existingUser: result.existingUser, error: null }));
      } else if (result.status === "invalid") {
        setOtp((o) => ({ ...o, phase: "enter", error: result.message || "Number sahi nahi lag raha." }));
      } else if (result.status === "rate_limited") {
        setOtp((o) => ({ ...o, error: result.message || null, cooldown: result.retryAfterSeconds }));
      } else {
        setOtp((o) => ({ ...o, error: result.message }));
      }
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyOtp = useCallback(async (rawCode: string) => {
    setBusy(true);
    try {
      const result = await boloService.verifyOtp(contactRef.current, rawCode);
      if (result.status === "verified") {
        proofRef.current = result.proof;
        setOtp((o) => ({ ...o, phase: "verified", error: null, existingUser: result.existingUser }));
        haptics.success();
      } else if (result.status === "expired") {
        setOtp((o) => ({ ...o, phase: "enter", error: result.message }));
      } else {
        setOtp((o) => ({ ...o, error: result.message }));
      }
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * The profile — and, for a visitor, the account and the session — in one
   * request. Idempotent: once it has succeeded, every later call answers with
   * the same result. Never navigates; that is `go_next` / Continue.
   */
  const completeAccount = useCallback(async () => {
    if (finishedRef.current) {
      return doneRef.current?.live
        ? { status: "live" as const, alreadyFinished: true }
        : { status: "saved" as const, alreadyFinished: true, missing: labelsFor(missingMinimum(draftRef.current.values)) };
    }
    const current = draftRef.current;
    if (!member && !contactRef.current.trim()) return { status: "needs_contact" as const };
    setBusy(true);
    try {
      const body = await boloService.complete(
        member
          ? // Signed in: the server reads who from the session, never from here.
            { fillingFor: current.fillingFor ?? "self", values: current.values }
          : {
              fillingFor: current.fillingFor ?? "self",
              values: current.values,
              contact: contactRef.current,
              accountName: accountNameRef.current || undefined,
              proof: proofRef.current ?? undefined,
              password: accountPasswordRef.current || undefined,
            },
      );
      if (body.ok) {
        const result: Done = { live: body.live, existingAccount: body.existingAccount, hasPassword: body.hasPassword };
        finishedRef.current = true;
        doneRef.current = result;
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        unsaved.current = new Map();
        await removeStoredDraft(storageKey);
        // The session this call opened (a visitor) or changed (live): the
        // routing store learns it now, so the reel is open the moment they go.
        if (!member) {
          const user = await authService.session().catch(() => null);
          if (user) useSession.getState().signedIn(user);
        } else if (body.live) {
          useSession.getState().markActive();
        }
        setDone(result);
        setStage("done");
        haptics.success();
        return body.live ? { status: "live" as const } : { status: "saved" as const, missing: labelsFor(body.missing ?? []) };
      }
      if (body.error === "WRONG_ACCOUNT") {
        router.replace("/");
        return { status: "error" as const, message: body.message };
      }
      if (body.error === "PASSWORD_REQUIRED") {
        setNotice(body.message || "Aage badhne ke liye apna password banaiye.");
        return { status: "needs_password" as const };
      }
      if (body.error === "VERIFICATION_REQUIRED") {
        setOtp((o) => ({ ...o, phase: "enter", error: body.message || null }));
        return { status: "verification_required" as const };
      }
      if (body.error === "ALREADY_EXISTS") {
        setNotice(body.message || "Is number se account pehle se hai — login kar lijiye.");
        setOtp((o) => ({ ...o, phase: "enter", error: null, existingUser: true }));
        return { status: "already_registered" as const, otpSent: false };
      }
      setNotice(body.message || "Profile save nahi ho payi. Ek baar phir try karein.");
      return { status: "error" as const, message: body.message };
    } catch {
      setNotice("Network error — dobara try karein.");
      return { status: "error" as const, message: "network" };
    } finally {
      setBusy(false);
    }
  }, [member, storageKey]);

  /** Preferences that arrive *after* `finish`: the account exists, so the ordinary autosave persists them. */
  const persistLatePreferences = useCallback(async (keys: BoloPreferenceKey[]) => {
    const values: Record<string, string> = {};
    for (const key of keys) if (draftRef.current.values[key]) values[key] = draftRef.current.values[key]!;
    if (Object.keys(values).length === 0) return true;
    try {
      await boloService.autosave(
        values,
        Object.fromEntries(Object.keys(values).map((key) => [key, { source: "user" as const, confirmed: true }])),
        draftRef.current.fillingFor ?? "self",
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  /* ------------------------------ tools ------------------------------- */

  const runTool = useCallback(
    async (call: ToolCallRequest): Promise<Record<string, unknown>> => {
      switch (call.name) {
        case "save_answers": {
          const before = draftRef.current;
          const { fillingFor, ...fields } = call.args;
          if (isFillingFor(fillingFor)) setWho(fillingFor);
          const result = applyAnswers(fields);
          noteAccepted(before, "voice");
          const refused = result.rejected.find((r) => r.reason === "invalid");
          if (refused) setRejected({ key: refused.field, heard: refused.heard });
          if (stageRef.current === "start") setStage("talking");
          return {
            saved: result.saved,
            rejected: result.rejected.map((r) => ({ field: r.field, heard: r.heard, options: r.options })),
            missing: result.missing,
            filled: { ...draftRef.current.values },
            fillingFor: draftRef.current.fillingFor,
            next: result.missing.length > 0 ? "answers" : preferencesLeft().length > 0 ? "preferences" : "review",
          };
        }
        case "show_review": {
          const missingNow = missingMinimum(draftRef.current.values);
          const prefsLeft = preferencesLeft();
          if (prefsLeft.length > 0) {
            return {
              shown: false,
              next: "preferences",
              pending: prefsLeft,
              hint: "Pehle screen par khadi 2 pasand wali baat poori karo (user skip bhi kar sakta hai), phir show_review.",
            };
          }
          setStage("review");
          haptics.tap();
          return { shown: true, filled: { ...draftRef.current.values }, missing: missingNow };
        }
        case "confirm_review": {
          if (finishedRef.current) return { status: "confirmed", alreadyConfirmed: true, next: "go_next" };
          const missingNow = missingMinimum(draftRef.current.values);
          if (missingNow.length > 0) {
            if (stageRef.current === "contact") setStage("review");
            return { status: "incomplete", missing: missingNow, missingLabels: labelsFor(missingNow) };
          }
          if (member) {
            const alreadyConfirmed = draftRef.current.confirmed;
            if (!alreadyConfirmed) commitDraft({ ...draftRef.current, confirmed: true, updatedAt: Date.now() });
            if (stageRef.current !== "review") setStage("review");
            haptics.tap();
            return { status: "confirmed", alreadyConfirmed, next: nextAfterContact() };
          }
          const alreadyConfirmed = draftRef.current.confirmed && stageRef.current === "contact";
          if (!draftRef.current.confirmed) commitDraft({ ...draftRef.current, confirmed: true, updatedAt: Date.now() });
          if (stageRef.current !== "contact") {
            setStage("contact");
            haptics.tap();
          }
          return { status: "confirmed", alreadyConfirmed, next: "contact" };
        }
        case "request_otp": {
          if (member) return { status: "not_needed", hint: "Member pehle se login hai — number ya OTP mat poochho.", next: nextAfterContact() };
          const rawContact = String(call.args.contact ?? "").trim();
          const name = String(call.args.accountName ?? "").trim();
          if (rawContact) {
            setContact(rawContact);
            contactRef.current = rawContact;
          }
          if (name) {
            setAccountName(name);
            accountNameRef.current = name;
          }
          setStage("contact");
          const result = await sendOtp(rawContact);
          if (result.status === "sent" && result.existingUser) return { status: "already_registered", otpSent: true, masked: result.masked };
          if (result.status === "skipped" && result.existingUser) return { status: "already_registered", otpSent: false };
          if (result.status === "skipped") return { ...result, next: nextAfterContact(), passwordRequired: true };
          return { ...result };
        }
        case "verify_otp": {
          if (member) return { status: "not_needed", next: nextAfterContact() };
          const rawCode = String(call.args.code ?? "").replace(/\D/g, "");
          setCode(rawCode.slice(0, 6));
          const result = await verifyOtp(rawCode);
          if (result.status === "verified") return { status: "verified", existingUser: result.existingUser, next: nextAfterContact() };
          return { status: result.status };
        }
        case "save_preferences": {
          const { confirmed, ...fields } = call.args;
          if (confirmed !== true) {
            return {
              status: "not_confirmed",
              saved: [],
              hint: "Pehle values padh kar sunao aur 'sahi?' poochho; user haan bole to confirmed: true ke saath dobara bhejo.",
            };
          }
          const before = draftRef.current;
          const result = applyPreferences(fields);
          noteAccepted(before, "voice");
          const response: Record<string, unknown> = {
            saved: result.saved,
            rejected: result.rejected.map((r) => ({ field: r.field, heard: r.heard, options: r.options })),
            ignored: result.ignored,
            missing: result.missing,
            filled: { ...draftRef.current.values },
          };
          if (finishedRef.current) {
            const ok = result.saved.length === 0 || (await persistLatePreferences(result.saved));
            return { ...response, status: ok ? (result.saved.length > 0 ? "saved" : "nothing_saved") : "error", next: "go_next" };
          }
          const next =
            preferencesLeft().length > 0 ? "preferences" : draftRef.current.confirmed || stageRef.current === "contact" ? "finish" : "review";
          return { ...response, status: result.saved.length > 0 ? "saved" : "nothing_saved", next };
        }
        case "finish": {
          if (finishedRef.current) {
            const again = await completeAccount();
            return { ...again, next: doneRef.current?.hasPassword || passwordSavedRef.current ? "go_next" : "password" };
          }
          if (!member) {
            setStage("contact");
            const missingNow = missingMinimum(draftRef.current.values);
            if (!contactRef.current.trim()) return { status: "needs_contact", missing: labelsFor(missingNow) };
            const unreachable = otpRef.current.phase === "skipped" || !canSendCodeTo(contactRef.current);
            if (otpRef.current.phase !== "verified" && unreachable && !isAcceptablePassword(accountPasswordRef.current)) {
              return {
                status: "needs_password",
                hint: "Is contact par OTP nahi ja sakta — user ko screen par apna password banana hai. Bolo 'Screen par password bana kar Make Profile Live dabaiye' aur ruko. Password bolne ko mat kaho.",
              };
            }
          }
          const result = await completeAccount();
          if (result.status === "live" || result.status === "saved") {
            return {
              ...result,
              preferencesSaved: Object.keys(preferenceValues(draftRef.current.values)),
              next: doneRef.current?.hasPassword ? "go_next" : "password",
            };
          }
          return result;
        }
        case "go_next": {
          if (!finishedRef.current) return { status: "not_finished", hint: "Pehle finish call karo." };
          if (leavingRef.current) return { status: "already_leaving" };
          if (newPasswordRef.current && !passwordSavedRef.current) {
            return {
              status: "password_unsaved",
              hint: "User ne screen par password likha hai par save nahi kiya. Bolo 'Pehle Save Password dabaiye' aur ruko.",
            };
          }
          beginLeaving();
          return { status: "leaving", hint: "Ek shabd me alvida bolo, phir kuch mat bolo." };
        }
        default:
          return { status: "unknown_tool" };
      }
    },
    [
      applyAnswers,
      applyPreferences,
      beginLeaving,
      canSendCodeTo,
      commitDraft,
      completeAccount,
      member,
      nextAfterContact,
      noteAccepted,
      persistLatePreferences,
      preferencesLeft,
      sendOtp,
      setWho,
      verifyOtp,
    ],
  );

  /* ------------------------------ voice ------------------------------- */

  const onLiveEvent = useCallback(
    (event: LiveEvent) => {
      switch (event.type) {
        case "status":
          setLiveStatus(event.status);
          if (event.status === "listening" && leavingRef.current && goodbyeHeardRef.current) leaveNow();
          break;
        case "level":
          setLevel(event.level);
          break;
        case "transcript":
          if (event.role === "user") {
            userBuf.current += event.text;
            setUserNow(userBuf.current);
          } else {
            if (userBuf.current) {
              userBuf.current = "";
              setUserNow("");
            }
            grioBuf.current += event.text;
            setGrioNow(grioBuf.current);
            if (leavingRef.current) goodbyeHeardRef.current = true;
            // The question on screen follows the one Grio is actually asking out loud.
            if (stageRef.current === "start" || stageRef.current === "talking") {
              const current = draftRef.current;
              const asked = detectAskedField(grioBuf.current, pendingAskKeys(current.fillingFor, current.values, skippedPrefsRef.current));
              if (asked) setVoiceFocus(asked);
            }
          }
          break;
        case "interrupted":
        case "turn_complete":
          grioBuf.current = "";
          if (event.type === "turn_complete") {
            if (userBuf.current) {
              userBuf.current = "";
              setUserNow("");
            }
            if (leavingRef.current && goodbyeHeardRef.current && sessionRef.current?.currentStatus !== "speaking") leaveNow();
          }
          break;
        case "ended":
          sessionRef.current = null;
          mutedRef.current = false;
          setMuted(false);
          userBuf.current = "";
          setUserNow("");
          setGrioNow("");
          if (leavingRef.current) {
            leaveNow();
            break;
          }
          setDropped(event.reason !== "user" && event.reason !== "finished");
          if (event.reason === "idle") setNotice("Kaafi der se awaaz nahi aayi — baat-cheet rok di. Phir se shuru kar sakte hain.");
          else if (event.reason === "network" || event.reason === "go_away")
            setNotice("Connection toot gaya. Jo bhar gaya wo safe hai — phir se shuru karein ya type karein.");
          else if (event.reason === "max_session") setNotice("Ek session ki seema aa gayi. Jo bhar gaya wo safe hai — phir se shuru karein.");
          else if (event.reason === "background") setNotice("App band hote hi Grio ruk gayi. Jo bhar gaya wo safe hai — phir se shuru karein.");
          if (stageRef.current === "talking" && Object.keys(draftRef.current.values).length === 0) setStage("start");
          break;
        case "failed":
          sessionRef.current = null;
          mutedRef.current = false;
          setMuted(false);
          userBuf.current = "";
          setUserNow("");
          setGrioNow("");
          if (leavingRef.current) {
            leaveNow();
            break;
          }
          setDropped(true);
          setNotice(failureCopy(event.failure));
          if (stageRef.current === "talking" && Object.keys(draftRef.current.values).length === 0) setStage("start");
          break;
      }
    },
    [leaveNow],
  );

  const startVoice = useCallback(async () => {
    if (sessionRef.current || leavingRef.current || !voiceSupported) return;
    setNotice(null);
    setDropped(false);
    mutedRef.current = false;
    setMuted(false);
    userBuf.current = "";
    grioBuf.current = "";
    setUserNow("");
    setGrioNow("");
    const current = draftRef.current;
    const missingNow = missingMinimum(current.values);
    const prefsLeft = preferencesLeft();
    const session = createLiveSession(
      {
        onEvent: onLiveEvent,
        onToolCalls: async (calls) => {
          const out: Array<Record<string, unknown>> = [];
          for (const call of calls) out.push(await runTool(call));
          return out;
        },
      },
      // Built at the moment of starting, so answers tapped or typed before the mic count as given.
      member
        ? {
            mode: "member",
            kickoffText: boloMemberKickoff({
              firstName: member.firstName,
              fillingFor: current.fillingFor,
              missing: missingNow,
              needsReview: member.needsReview.filter((key) => Boolean(current.values[key])),
              preferencesPending: prefsLeft,
              values: current.values,
            }),
          }
        : {
            mode: "guest",
            kickoffText: boloGuestKickoff({
              fillingFor: current.fillingFor,
              missing: missingNow,
              confirmed: current.confirmed && stageRef.current === "contact",
              preferencesPending: prefsLeft,
              values: current.values,
            }),
          },
    );
    sessionRef.current = session;
    if (stageRef.current === "start") setStage("talking");
    haptics.tap();
    await session.start();
  }, [member, onLiveEvent, preferencesLeft, runTool, voiceSupported]);

  /** Stop ends the session and nothing else: the question stays, chips and keyboard carry on. */
  const stopVoice = useCallback(() => {
    sessionRef.current?.stop("user");
    sessionRef.current = null;
    mutedRef.current = false;
    setMuted(false);
    setDropped(false);
    setGrioNow("");
  }, []);

  /** The composer's mic: starts Grio when she is not live, pauses and resumes the microphone when she is. */
  const pressMic = useCallback(() => {
    if (leavingRef.current) return;
    const session = sessionRef.current;
    if (!session) {
      void startVoice();
      return;
    }
    if (session.currentStatus === "connecting") return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    session.setMuted(next);
    setMuted(next);
    haptics.tap();
  }, [startVoice]);

  /* ----------------------------- answers ------------------------------ */

  /** Where the conversation stands, in the words the screen's bracketed notes use to the model. */
  const nextNote = useCallback((): string => {
    const values = draftRef.current.values;
    const known = MINIMUM_LIVE_KEYS.filter((key) => values[key])
      .map((key) => `${FIELD_BY_KEY[key]?.label ?? key} = "${unbracket(values[key] ?? "")}"`)
      .join(", ");
    const already = known ? `Ab tak bhara hua (ye ho chuka — dobara mat poochho): ${known}. ` : "";
    const missingNow = missingMinimum(values);
    if (missingNow.length > 0) return `${already}Baaki: ${labelsFor(missingNow).join(", ")} — inme se ek baar me sirf EK poochho.`;
    const prefsLeft = missingPreferences(values).filter((key) => !skippedPrefsRef.current.includes(key));
    if (prefsLeft.length > 0) {
      return `${already}Sab 8 bhar gaye. Ab screen par optional pasand poochhi ja rahi hai — ${labelsFor(prefsLeft).join(", ")}. Wahi ek-ek karke poochho, phir show_review.`;
    }
    return `${already}Sab 8 bhar gaye aur 2 pasand ka step poora ho gaya — ab show_review call karke poochho 'sahi hai?'.`;
  }, []);

  /** An answer given on screen, told to a live Grio in the screen's bracketed voice — so she moves on. */
  const tellGrio = useCallback(
    (key: string, source: "chip" | "typed") => {
      const session = sessionRef.current;
      if (!session) return;
      const current = draftRef.current;
      let what: string;
      if (key === FILLING_FOR_ASK && current.fillingFor) {
        const gender = impliedGender(current.fillingFor);
        what = `profile ${WHO_NOTE[current.fillingFor]}${gender ? ` (isi se gender "${gender}" bhi bhar gaya)` : ""}`;
      } else {
        what = `${key} (${FIELD_BY_KEY[key]?.label ?? key}) = "${unbracket(current.values[key] ?? "")}"`;
      }
      const who = current.fillingFor ? "" : " Profile kiske liye abhi pata nahi — wo bhi poochhna hai.";
      session.sendText(`[User ne screen par ${source === "chip" ? "tap karke" : "likh kar"} jawab diya: ${what} — save ho gaya.${who} ${nextNote()}]`);
    },
    [nextNote],
  );

  /** "Abhi nahi" on one of the two preferences: nothing stored, nothing asked again. */
  const skipAsk = useCallback(
    (key: string) => {
      if (leavingRef.current || !isPreferenceAsk(key) || skippedPrefsRef.current.includes(key)) return;
      const next = [...skippedPrefsRef.current, key];
      skippedPrefsRef.current = next;
      setSkippedPrefs(next);
      setRejected(null);
      haptics.tap();
      if (stageRef.current === "start") setStage("talking");
      sessionRef.current?.sendText(
        `[User ne screen par "${FIELD_BY_KEY[key]?.label ?? key}" wali pasand abhi ke liye rehne di — ise dobara mat poochho. ${nextNote()}]`,
      );
    },
    [nextNote],
  );

  /** A tapped chip, or a typed bare answer: into the draft, into the bubble, and — with Grio live — told to her. */
  const answerOnScreen = useCallback(
    (key: string, value: string, source: "chip" | "typed") => {
      if (leavingRef.current) return;
      const before = draftRef.current;
      if (key === FILLING_FOR_ASK) {
        if (!isFillingFor(value) || before.fillingFor === value) return;
        setWho(value);
        haptics.tap();
      } else if (isBoloPreferenceKey(key)) {
        const result = applyPreferences({ [key]: value });
        if (!result.saved.includes(key) || result.values[key] === before.values[key]) return;
      } else {
        const result = applyAnswers({ [key]: value });
        if (!result.saved.includes(key) || result.values[key] === before.values[key]) return;
      }
      noteAccepted(before, source);
      setRejected(null);
      if (stageRef.current === "start") setStage("talking");
      tellGrio(key, source);
    },
    [applyAnswers, applyPreferences, noteAccepted, setWho, tellGrio],
  );

  const pickChip = useCallback(
    (key: string, index: number) => {
      // A chip still fading out belongs to the question before; its tap answers nothing now.
      if (key !== heroKeyRef.current) return;
      const chip = askFor(key, draftRef.current.fillingFor, draftRef.current.values).chips[index];
      if (!chip) return;
      if (chip.skip) {
        skipAsk(key);
        return;
      }
      if (chip.value === null) {
        setComposerHint(chip.placeholder ?? null);
        setFocusComposer((n) => n + 1);
        return;
      }
      answerOnScreen(key, chip.value, "chip");
    },
    [answerOnScreen, skipAsk],
  );

  const submitTyped = useCallback(async () => {
    const text = typed.trim();
    if (!text || leavingRef.current) return;
    setTyped("");
    setComposerHint(null);
    const conversingNow = stageRef.current === "start" || stageRef.current === "talking";
    const key = conversingNow ? heroKeyRef.current : null;

    if (sessionRef.current && liveActive) {
      // Typed to a live Grio is the same as said to her: she saves what fits, and the bubble ticks when she does.
      const onScreen = key
        ? `[User ne likh kar jawab diya; screen par abhi "${key === FILLING_FOR_ASK ? "profile kiske liye" : (FIELD_BY_KEY[key]?.label ?? key)}" poochha ja raha tha] `
        : "";
      sessionRef.current.sendText(`${onScreen}${unbracket(text)}`);
      setLatest({ id: ++answerSeq.current, kind: "sent", text });
      return;
    }

    // No session: a bare answer to the question on screen needs no model.
    if (key) {
      const value = key === FILLING_FOR_ASK ? readFillingFor(text) : readTypedValue(key, text);
      if (value) {
        answerOnScreen(key, value, "typed");
        return;
      }
    }

    setExtracting(true);
    setNotice(null);
    try {
      const result = await ai.extractProfile({
        transcript: text,
        known: draftRef.current.values,
        askedField: key && key !== FILLING_FOR_ASK ? key : undefined,
        fillingFor: draftRef.current.fillingFor ?? "self",
      });
      // Heard, never inferred: a derived value is a guess, and a guess never reaches the draft.
      const incoming: Record<string, string> = {};
      for (const v of result.values) if (!v.inferred && v.value) incoming[v.key] = v.value;
      const before = draftRef.current;
      const accepted = applyAnswers(incoming);
      noteAccepted(before, "typed");
      if (accepted.saved.length === 0) {
        setNotice("Isme se koi profile detail samajh nahi aayi — naam, DOB, city jaise details likhiye.");
      } else if (stageRef.current === "start") {
        setStage("talking");
      }
    } catch (err) {
      setNotice(err instanceof Error && err.message ? err.message : "Network error — dobara try karein.");
    } finally {
      setExtracting(false);
    }
  }, [answerOnScreen, applyAnswers, liveActive, noteAccepted, typed]);

  /* ------------------------------ actions ----------------------------- */

  const confirmReview = useCallback(() => {
    if (missingMinimum(draftRef.current.values).length > 0) return;
    haptics.tap();
    commitDraft({ ...draftRef.current, confirmed: true, updatedAt: Date.now() });
    setStage("contact");
    sessionRef.current?.sendText("[User ne review card par 'sahi hai' dabaya — review confirmed; ab contact poochho]");
  }, [commitDraft]);

  const uiSendOtp = useCallback(async () => {
    setNotice(null);
    const result = await sendOtp(contactRef.current);
    if (result.status === "sent") sessionRef.current?.sendText(`[User ne type karke number diya; OTP bhej diya gaya ${result.masked} par — ab code poochho]`);
  }, [sendOtp]);

  const uiFinish = useCallback(async () => {
    setNotice(null);
    const result = await completeAccount();
    if (result.status === "live" || result.status === "saved") {
      sessionRef.current?.sendText(
        doneRef.current?.hasPassword
          ? "[User ne button se profile bana li — ek line me badhai do, phir EK baar poochho 'Rishte dekhein — chalein?'; haan par go_next]"
          : "[User ne button se profile bana li — ek line me badhai do aur usi line me bolo 'Chahein to screen par apna password bana lijiye — ya seedha rishte dekhein, chalein?'; haan par go_next]",
      );
    }
  }, [completeAccount]);

  const uiVerify = useCallback(
    async (rawCode: string) => {
      setNotice(null);
      const result = await verifyOtp(rawCode);
      if (result.status === "verified") {
        const next = nextAfterContact();
        sessionRef.current?.sendText(
          next === "preferences"
            ? "[OTP verify ho gaya — ab 2 optional pasand poochho (umar, sheher), phir finish]"
            : "[OTP verify ho gaya — ab finish call karo]",
        );
        if (!sessionRef.current) await completeAccount();
      }
    },
    [completeAccount, nextAfterContact, verifyOtp],
  );

  /** A member's "All Correct — Go Live": the review confirmed and the profile finished in one tap. */
  const memberGoLive = useCallback(async () => {
    if (missingMinimum(draftRef.current.values).length > 0) return;
    haptics.tap();
    commitDraft({ ...draftRef.current, confirmed: true, updatedAt: Date.now() });
    await uiFinish();
  }, [commitDraft, uiFinish]);

  const savePassword = useCallback(async (announce: boolean): Promise<boolean> => {
    const value = newPasswordRef.current;
    if (!isAcceptablePassword(value)) {
      setPasswordError(`Kam se kam ${PASSWORD_MIN_LENGTH} characters ka password chahiye.`);
      return false;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const res = await boloService.setPassword(value);
      if (!res.ok) {
        setPasswordError(res.message);
        return false;
      }
      passwordSavedRef.current = true;
      setPasswordSaved(true);
      haptics.success();
      if (announce) {
        sessionRef.current?.sendText(
          "[User ne screen par apna password bana liya — ek shabd me 'Badhiya' bolo, phir EK baar poochho 'Rishte dekhein — chalein?'; haan par go_next]",
        );
      }
      return true;
    } finally {
      setPasswordBusy(false);
    }
  }, []);

  const continueFromDone = useCallback(async () => {
    if (newPasswordRef.current && !passwordSavedRef.current) {
      const saved = await savePassword(false);
      if (!saved) return;
    }
    beginLeaving();
  }, [beginLeaving, savePassword]);

  /** "Save Draft & Create Account" — a visitor with part of the card, straight to the contact step. */
  const goToContact = useCallback(() => {
    setSheetOpen(false);
    setStage("contact");
  }, []);

  /** "Open Full Form": everything answered here is on the profile first, so the form shows it. */
  const openFullForm = useCallback(async () => {
    setSheetOpen(false);
    await flushAutosave();
    router.push("/setup");
  }, [flushAutosave]);

  /**
   * Back from the full form: whatever it saved is the profile now. Server
   * values win where they exist (the same rule as the start), local answers
   * stay for the fields the server still lacks.
   */
  const mergeServerMember = useCallback(
    (fresh: { values: BoloValues; fillingFor: FillingFor | null }) => {
      if (finishedRef.current) return;
      const current = draftRef.current;
      const gaps = Object.fromEntries(Object.entries(current.values).filter(([key]) => !fresh.values[key]));
      const values = acceptAnswers(fresh.values, gaps).values;
      const changed = Object.keys({ ...values, ...current.values }).some((key) => values[key] !== current.values[key]);
      const fillingFor = fresh.fillingFor ?? current.fillingFor;
      if (!changed && fillingFor === current.fillingFor) return;
      commitDraft({ ...current, values, fillingFor, confirmed: false, updatedAt: Date.now() });
    },
    [commitDraft],
  );

  const logout = useCallback(async () => {
    sessionRef.current?.stop("user");
    sessionRef.current = null;
    await flushAutosave();
    await useSession.getState().signOut();
    router.replace("/");
  }, [flushAutosave]);

  /* ------------------------------ screen ------------------------------ */

  // The question on screen: the next one Grio needs — held back for a moment
  // after an answer, so the ✓ lands before the next card slides in.
  const heroMoves = heroKey !== targetKey && !(conversing && targetKey === null);
  const heroHeld = heroMoves && conversing && heroKey !== null && !pending.includes(heroKey);
  if (heroMoves && !heroHeld) setHeroKey(targetKey);
  useEffect(() => {
    if (!heroHeld) return;
    const timer = setTimeout(() => setHeroKey(targetKey), ACK_MS);
    return () => clearTimeout(timer);
  }, [heroHeld, targetKey]);

  // Answered questions let go of what pointed at them.
  if (voiceFocus !== null && !pending.includes(voiceFocus)) setVoiceFocus(null);
  if (rejected !== null && !pending.includes(rejected.key)) setRejected(null);

  // A new question, a fresh composer hint.
  const [hintFor, setHintFor] = useState(heroKey);
  if (hintFor !== heroKey) {
    setHintFor(heroKey);
    setComposerHint(null);
  }

  // All eight in (and the two preferences past): the review, once the last ✓ has landed.
  useEffect(() => {
    if (!hydrated || !conversing || pending.length > 0) return;
    const timer = setTimeout(() => {
      if (!leavingRef.current && (stageRef.current === "start" || stageRef.current === "talking")) setStage("review");
    }, ACK_MS);
    return () => clearTimeout(timer);
  }, [conversing, hydrated, pending.length]);

  const ask = conversing && heroKey ? askFor(heroKey, draft.fillingFor, draft.values) : null;

  return {
    // who
    member,
    channels,
    voiceSupported,
    voiceAvailable: Boolean(boot?.voiceAvailable),
    // state
    hydrated,
    draft,
    stage,
    conversing,
    pending,
    missing,
    isComplete,
    savedPreferences,
    ask,
    heroKey,
    latest,
    ack,
    rejected,
    highlight,
    notice,
    typed,
    extracting,
    composerHint,
    focusComposer,
    sheetOpen,
    contact,
    accountName,
    code,
    otp,
    busy,
    done,
    leaving,
    accountPassword,
    newPassword,
    passwordSaved,
    passwordBusy,
    passwordError,
    liveStatus,
    liveActive,
    level,
    userNow,
    grioNow,
    muted,
    dropped,
    // actions
    setTyped,
    setNotice,
    setSheetOpen,
    setAccountName,
    setCode,
    setAccountPassword,
    setNewPassword: (value: string) => {
      setNewPassword(value);
      setPasswordError(null);
    },
    setContact: (value: string) => {
      setContact(value);
      if (otpRef.current.phase !== "enter") setOtp({ phase: "enter", masked: null, existingUser: false, error: null, cooldown: 0 });
      proofRef.current = null;
    },
    pickChip,
    submitTyped,
    editField,
    confirmReview,
    uiSendOtp,
    uiVerify,
    uiFinish,
    memberGoLive,
    savePassword,
    continueFromDone,
    goToContact,
    openFullForm,
    mergeServerMember,
    startVoice,
    stopVoice,
    pressMic,
    logout,
    flushAutosave,
  };
}

export type BoloFlow = ReturnType<typeof useBoloFlow>;
