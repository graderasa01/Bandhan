"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Heart, Info, ListChecks, Loader2, LogOut, Sparkles, X } from "lucide-react";
import { PASSWORD_MIN_LENGTH, isAcceptablePassword } from "@/lib/auth/passwordPolicy";
import { boloGuestKickoff, boloMemberKickoff } from "@/lib/bolo/agent";
import {
  BOLO_DRAFT_KEY,
  MINIMUM_LIVE_KEYS,
  acceptAnswers,
  acceptPreferences,
  emptyDraft,
  isBoloPreferenceKey,
  isFillingFor,
  labelsFor,
  memberDraftKey,
  missingMinimum,
  missingPreferences,
  normalizeAnswer,
  preferenceValues,
  type BoloDraft,
  type BoloMember,
  type BoloPreferenceKey,
  type BoloValues,
} from "@/lib/bolo/draft";
import {
  GrioLiveSession,
  isLiveVoiceSupported,
  type LiveEvent,
  type LiveFailure,
  type LiveStatus,
  type ToolCallRequest,
} from "@/lib/bolo/liveClient";
import {
  FILLING_FOR_ASK,
  askFor,
  chipFor,
  detectAskedField,
  displayDate,
  impliedGender,
  isPreferenceAsk,
  pendingAskKeys,
  readFillingFor,
  readTypedValue,
} from "@/lib/bolo/questions";
import type { BiodataResponse, FillingFor, InterviewResponse } from "@/lib/contracts/interview";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { EASE_LUXE, haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";
import AnswerBubble, { type BubbleContent } from "@/components/bolo/AnswerBubble";
import AnswerChips from "@/components/bolo/AnswerChips";
import AnswerComposer, { useKeyboardInset, type ComposerMicState } from "@/components/bolo/AnswerComposer";
import BoloHeader from "@/components/bolo/BoloHeader";
import ContactStep, { type OtpState } from "@/components/bolo/ContactStep";
import GrioQuestion from "@/components/bolo/GrioQuestion";
import LiveVoiceBar, { type VoiceBarMode } from "@/components/bolo/LiveVoiceBar";
import ProfileFillCard from "@/components/bolo/ProfileFillCard";
import ProfileSheet from "@/components/bolo/ProfileSheet";
import SetPasswordCard from "@/components/bolo/SetPasswordCard";

/**
 * `/bolo` — the spoken front door.
 *
 * One page, no long form. Grio (Gemini Live) asks the eight questions a live
 * profile needs; the visitor answers each one however suits them — out loud,
 * with a tap, or typed — and the profile fills as they go; the full card
 * becomes the review; then — and only then — a number, a code, and the
 * account exists around a profile that is already complete.
 *
 * ## The screen
 *
 * A conversation, not a form. Top to bottom: the mark and the 3/8 progress
 * (`BoloHeader`); one slim line saying what the live voice is doing
 * (`LiveVoiceBar` — no orb); the profile folded to a single line
 * (`ProfileSheet`); the question Grio is on (`GrioQuestion`, chosen by
 * `lib/bolo/questions.ts`); the latest accepted answer (`AnswerBubble`); the
 * answers that can simply be tapped (`AnswerChips`); and, fixed to the bottom,
 * one composer to type, attach a biodata or pause the mic (`AnswerComposer`).
 *
 * There is no screen for choosing between talking and typing, and nothing
 * given on screen touches the live session's lifecycle. A chip is saved to the
 * draft on the spot and Grio is *told* (`sendText`, in the page's bracketed
 * voice), so she moves on to what is still missing. A typed line goes to a
 * live Grio as speech would. With no session, the same chip saves the same
 * way, and a typed line is taken in code when it is a bare answer to the
 * question on screen (`readTypedValue`) or read by the extractor when it is
 * not. Whichever way an answer arrives, the bubble and the progress show it
 * the same way — and only when the draft actually changed.
 *
 * ## Who owns what
 *
 *   - **The model** owns the conversation: what to ask next, in which words.
 *   - **This component** owns the draft. Every tool Grio calls runs here,
 *     against `draftRef`, and the model only ever learns what was accepted.
 *   - **The server** owns the truth: `/api/bolo/complete` re-validates every
 *     value and is the only thing that can say "live".
 *
 * Chips, typing and a biodata upload reach the same draft through the same
 * `acceptAnswers`, so a visitor who cannot (or would rather not) speak gets
 * the same card, the same review and the same finish. Voice is the fast path,
 * not the only path.
 *
 * ## Signed in, not live yet
 *
 * `member` is set when the server page found a signed-in member whose profile
 * is not live — they registered, used Google or an OTP login, or saved a draft
 * halfway, and all of those land here now instead of on the old builder. The
 * draft starts from their saved answers, Grio gets the member brief (no
 * contact tools) and a first turn saying what is already filled, the contact
 * step never appears, and `finish` writes onto the profile they already have.
 * "Open Full Form", in the profile sheet, is the typed deck.
 *
 * ## The two preferences are questions nine and ten
 *
 * The eighth answer does not go straight to the review: the ladder
 * (`pendingAskKeys`) carries on into the partner's age range and city — the
 * pair `preferenceEvidence.ts` needs before the reel may show a preference
 * match at all. They were asked out loud, after the OTP, and only by Grio, so
 * everyone who tapped their way through — and everyone whose microphone never
 * opened — reached the reel with nothing stated and a banner saying so. Now
 * they are two ordinary questions, in the place the person is already
 * answering questions, with the same chips, keyboard and voice.
 *
 * Optional stays optional: every preference ask carries an "Abhi nahi" chip,
 * a skipped key goes into `skippedPrefs` (this sitting only, never the draft)
 * and nothing asks for it again — not the screen, and not Grio, whose
 * `nextAfterContact` stops offering it too.
 *
 * ## The order after the code is verified
 *
 * OTP → `finish`, once → "Rishte dekhein?" → `go_next`. The preferences are
 * long since asked, and being in the draft they ride in the same request that
 * creates the profile; `completeGuestProfile` accepts any catalog field, so
 * nothing new had to be built on the server for them. A model that asks for
 * them late — after `finish`, or because the round was cut short — is not
 * refused: by then the visitor has a session, and the ordinary signed-in
 * autosave persists the two values the same way the deck would.
 *
 * Leaving the page is `go_next`'s job alone. `finish` used to arm a redirect
 * timer, which cut the preference question off mid-sentence; now the page
 * stays put — Grio's voice bar and a Continue button both visible — until
 * the visitor says "chalein" or taps.
 *
 * ## Passwords
 *
 * Two moments, nothing generated, and neither field is ever sent to the model:
 *
 *   - on the contact step, when no code can reach the contact — required,
 *     because an account with neither a code nor a password to log in by is
 *     locked out when its session ends (`ContactStep`, `completeService`);
 *   - on the done screen, for an account that still has none — optional
 *     (`SetPasswordCard`). A typed-but-unsaved password holds `go_next` back,
 *     and Continue saves a valid one on the way out rather than dropping it.
 */

type Stage = "start" | "talking" | "review" | "contact" | "done";
type Done = { landing: string; live: boolean; existingAccount: boolean; hasPassword: boolean };
/** How an answer reached the draft — only the bubble and its acknowledgement care. */
type AnswerSource = "voice" | "chip" | "typed" | "biodata" | "edit";
/**
 * The latest answer, for the bubble: what the draft `accepted` (recorded only
 * when something actually changed), or a line `sent` to a live Grio that she
 * has not saved yet.
 */
type Latest =
  | { id: number; kind: "accepted"; source: AnswerSource; fillingFor: FillingFor | null; keys: string[]; values: BoloValues }
  | { id: number; kind: "sent"; text: string };

interface Props {
  channels: { mobile: boolean; email: boolean };
  /** Gemini key present and the voice flag not OFF — the server's word, so a phone without a mic still sees the right first screen. */
  voiceAvailable: boolean;
  /** A signed-in member finishing an unfinished profile; null for a visitor. See "Signed in, not live yet". */
  member: BoloMember | null;
}

/** Where "Rishte dekhein — chalein?" goes once the profile is live. */
const REEL_PATH = "/user/reel";
/** The typed deck, for a member who would rather use the full form. Closing it comes back here (`InterviewMode.leaveBuilder`). */
const MANUAL_DECK_PATH = "/profile/build?mode=manual";
/**
 * After `go_next`, how long Grio gets for her one-word goodbye before the page
 * leaves regardless. The page leaves earlier the moment the goodbye has been
 * heard and played out; this is only the ceiling.
 */
const GOODBYE_GRACE_MS = 3500;
/**
 * How long an answered question stays up before the next one slides in — long
 * enough for its ✓ to land and be seen, short enough that nobody waits on it.
 */
const ACK_MS = 720;
/** The one word beside Grio's name after an answer lands. Taken in turn, never at random. */
const ACK_WORDS: ReadonlyArray<readonly [key: string, fallback: string]> = [
  ["bolo.ack.great", "Badhiya"],
  ["bolo.ack.gotIt", "Theek hai"],
  ["bolo.ack.noted", "Noted"],
  ["bolo.ack.thanks", "Shukriya"],
];
/** "Who is this for", in the words the page's notes and the kickoffs use with the model. */
const WHO_NOTE: Record<FillingFor, string> = { self: "apne liye", son: "bete ke liye", daughter: "beti ke liye" };

/** The page writes its notes to the model in square brackets, so text a person typed never carries any in. */
function unbracket(text: string): string {
  return text.replace(/[[\]]/g, "");
}

function readStoredDraft(key: string): BoloDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BoloDraft>;
    if (parsed.version !== 1 || typeof parsed.values !== "object" || !parsed.values) return null;
    return {
      version: 1,
      fillingFor: isFillingFor(parsed.fillingFor) ? parsed.fillingFor : null,
      values: parsed.values as BoloValues,
      confirmed: false,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * A member's starting draft: what the profile already holds, then — only for
 * fields it has nothing for — answers given on this phone before (their own
 * unfinished session here, or a guest draft from before they logged in). The
 * saved profile always wins a disagreement. A guest draft is folded in once
 * and removed, so it can never pour into a different account on a shared phone.
 */
function memberStartDraft(member: BoloMember): BoloDraft {
  let values: BoloValues = { ...member.values };
  let fillingFor = member.fillingFor;
  for (const stored of [readStoredDraft(memberDraftKey(member.userId)), readStoredDraft(BOLO_DRAFT_KEY)]) {
    if (!stored) continue;
    const gaps = Object.fromEntries(Object.entries(stored.values).filter(([key]) => !values[key]));
    values = acceptAnswers(values, gaps).values;
    fillingFor = fillingFor ?? stored.fillingFor;
  }
  try {
    localStorage.removeItem(BOLO_DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
  return { version: 1, fillingFor, values, confirmed: false, updatedAt: Date.now() };
}

export default function BoloExperience({ channels, voiceAvailable, member }: Props) {
  const t = useT();
  const router = useRouter();
  const reduced = useReducedMotion();

  const [draft, setDraft] = useState<BoloDraft>(emptyDraft);
  const draftRef = useRef(draft);
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<Stage>("start");
  const stageRef = useRef(stage);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [level, setLevel] = useState(0);
  /** What the visitor is saying right now, as Gemini hears it — shown in the voice bar, never saved. */
  const [userNow, setUserNow] = useState("");
  /** What Grio is saying right now, as Gemini transcribes her — the voice bar's caption. Never saved either. */
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
  /** The contact step's password, for a contact no code can reach. Never sent to Grio. */
  const [accountPassword, setAccountPassword] = useState("");
  /** The done screen's optional password, for an account that has none. Never sent to Grio. */
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  /** The question on screen. Trails the next one by `ACK_MS` after an answer, so the ✓ is seen. */
  const [heroKey, setHeroKey] = useState<string | null>(null);
  /** An unanswered field Grio has just asked about out loud — the question on screen follows it. */
  const [voiceFocus, setVoiceFocus] = useState<string | null>(null);
  /**
   * The optional preferences waved away with "Abhi nahi". This sitting only —
   * it is a decision about the conversation, not an answer, so it never
   * reaches the draft, the profile or the model's idea of what is filled.
   */
  const [skippedPrefs, setSkippedPrefs] = useState<string[]>([]);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [ack, setAck] = useState<{ key: string; fallback: string } | null>(null);
  /** What Grio heard for a field whose own rule refused it — said under that question. */
  const [rejected, setRejected] = useState<{ key: string; heard: string } | null>(null);
  /** The microphone is paused from the composer; the session itself stays open. */
  const [muted, setMuted] = useState(false);
  /** The last session ended on its own — the network, a long silence, a limit — rather than by Stop. */
  const [dropped, setDropped] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** The composer's placeholder after a "+ Doosra shehar" kind of chip. */
  const [composerHint, setComposerHint] = useState<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);

  const sessionRef = useRef<GrioLiveSession | null>(null);
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
  /** `go_next` was called (or Continue tapped): no more questions, leave on the goodbye. */
  const leavingRef = useRef(false);
  /** `router.replace` has run — the single guard against a second navigation. */
  const navigatedRef = useRef(false);
  /** Grio has said something since `go_next` — her goodbye — so the page may leave as soon as it has played. */
  const goodbyeHeardRef = useRef(false);
  const leaveTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const heroKeyRef = useRef(heroKey);
  const skippedPrefsRef = useRef(skippedPrefs);
  const mutedRef = useRef(false);
  const answerSeq = useRef(0);
  const ackTimer = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);

  stageRef.current = stage;
  contactRef.current = contact;
  accountNameRef.current = accountName;
  otpRef.current = otp;
  accountPasswordRef.current = accountPassword;
  newPasswordRef.current = newPassword;
  passwordSavedRef.current = passwordSaved;
  heroKeyRef.current = heroKey;
  skippedPrefsRef.current = skippedPrefs;

  /** Where this browser keeps the unfinished draft — a member's own key, or the one shared guest key. */
  const storageKey = member ? memberDraftKey(member.userId) : BOLO_DRAFT_KEY;
  const voiceSupported = useMemo(() => voiceAvailable && isLiveVoiceSupported(), [voiceAvailable]);
  const liveActive = liveStatus === "connecting" || liveStatus === "listening" || liveStatus === "speaking";
  const missing = useMemo(() => missingMinimum(draft.values), [draft.values]);
  const isComplete = missing.length === 0;
  const savedPreferences = useMemo(() => preferenceValues(draft.values), [draft.values]);
  const conversing = stage === "start" || stage === "talking";
  /**
   * Everything still to ask, in Grio's order — who the profile is for first,
   * while that is unknown, and the two optional preferences last, once nothing
   * the profile needs to go live is outstanding.
   */
  const pending = useMemo(
    () => pendingAskKeys(draft.fillingFor, draft.values, skippedPrefs),
    [draft.fillingFor, draft.values, skippedPrefs],
  );
  const focus = voiceFocus !== null && pending.includes(voiceFocus) ? voiceFocus : null;
  const targetKey = conversing ? (focus ?? pending[0] ?? null) : null;
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 0;

  /* ---------------------------- persistence --------------------------- */

  useEffect(() => {
    const stored = member ? memberStartDraft(member) : (readStoredDraft(BOLO_DRAFT_KEY) ?? emptyDraft());
    draftRef.current = stored;
    setDraft(stored);
    const pendingNow = pendingAskKeys(stored.fillingFor, stored.values);
    if (pendingNow.length === 0) {
      // Everything already there, preferences and all: the review is the next step.
      setStage("review");
    } else {
      // Anything still to ask — a minimum field, or one of the two
      // preferences: straight into the conversation, on its next question. A
      // member keeps the start state, whose greeting says how much is left.
      if (!member && Object.keys(stored.values).length > 0) setStage("talking");
      setHeroKey(pendingNow[0] ?? null);
    }
    setHydrated(true);
    // Once, on mount: `member` comes from the server render, and re-running
    // this would throw away every answer given since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Once the profile exists the server has it; nothing left to keep here.
    if (!hydrated || finishedRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* private mode — the draft simply lives in memory */
    }
  }, [draft, hydrated, storageKey]);

  useEffect(() => {
    if (otp.cooldown <= 0) return;
    const timer = window.setTimeout(() => setOtp((o) => ({ ...o, cooldown: o.cooldown - 1 })), 1000);
    return () => window.clearTimeout(timer);
  }, [otp.cooldown]);

  useEffect(
    () => () => {
      sessionRef.current?.stop("user");
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    },
    [],
  );

  /* ------------------------------ draft ------------------------------- */

  const commitDraft = useCallback((next: BoloDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  /**
   * Compare the draft with how it was before an answer and, when something
   * really changed, make that the bubble. A tool call that saves the same value
   * again — Grio catching up with a chip the page already saved — changes
   * nothing, so it puts up no second bubble and no second acknowledgement.
   */
  const noteAccepted = useCallback((before: BoloDraft, source: AnswerSource) => {
    const after = draftRef.current;
    const keys = Object.keys(after.values).filter(
      (key) => Boolean(after.values[key]) && after.values[key] !== before.values[key],
    );
    const who = after.fillingFor !== null && after.fillingFor !== before.fillingFor ? after.fillingFor : null;
    if (keys.length === 0 && who === null) return;
    const id = ++answerSeq.current;
    setLatest({ id, kind: "accepted", source, fillingFor: who, keys, values: after.values });
    if (source === "biodata" || source === "edit") return;
    const [key, fallback] = ACK_WORDS[id % ACK_WORDS.length] ?? ["bolo.ack.great", "Badhiya"];
    setAck({ key, fallback });
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    ackTimer.current = window.setTimeout(() => setAck(null), ACK_MS + 600);
  }, []);

  const applyAnswers = useCallback(
    (incoming: Record<string, unknown>) => {
      const result = acceptAnswers(draftRef.current.values, incoming);
      // A corrected answer is no longer the reviewed one.
      const confirmed = result.saved.length > 0 ? false : draftRef.current.confirmed;
      commitDraft({ ...draftRef.current, values: result.values, confirmed, updatedAt: Date.now() });
      if (result.saved.length > 0) {
        setHighlight(result.saved);
        haptic("tap");
        window.setTimeout(() => setHighlight((h) => (h === result.saved ? [] : h)), 1400);
      }
      return result;
    },
    [commitDraft],
  );

  /** The two optional preferences — only those two keys, only into the draft. */
  const applyPreferences = useCallback(
    (incoming: Record<string, unknown>) => {
      const result = acceptPreferences(draftRef.current.values, incoming);
      if (result.saved.length > 0) {
        commitDraft({ ...draftRef.current, values: result.values, updatedAt: Date.now() });
        haptic("tap");
      }
      return result;
    },
    [commitDraft],
  );

  const setWho = useCallback(
    (who: FillingFor) => {
      const current = draftRef.current;
      // "Bete ke liye" / "beti ke liye" has already answered gender — the typed
      // interview applies the same rule (`setFillingFor`, profileState.tsx), and
      // without it the next question would be "beta hai ya beti?". Switching
      // back to "apne liye" drops only a gender that choice had filled in.
      const implied = impliedGender(who);
      const previous = impliedGender(current.fillingFor);
      const values: BoloValues = { ...current.values };
      if (implied) values.gender = implied;
      else if (previous && values.gender === previous) delete values.gender;
      const genderChanged = values.gender !== current.values.gender;
      commitDraft({
        ...current,
        fillingFor: who,
        values,
        confirmed: genderChanged ? false : current.confirmed,
        updatedAt: Date.now(),
      });
    },
    [commitDraft],
  );

  const editField = useCallback(
    (key: string, value: string) => {
      const before = draftRef.current;
      const normalized = normalizeAnswer(key, value);
      const next: BoloDraft = {
        ...before,
        values: { ...before.values, [key]: normalized },
        confirmed: false,
        updatedAt: Date.now(),
      };
      if (!normalized) delete next.values[key];
      commitDraft(next);
      noteAccepted(before, "edit");
      sessionRef.current?.sendText(`[User ne screen par ${key} badla: "${normalized || "(khaali)"}"]`);
    },
    [commitDraft, noteAccepted],
  );

  /**
   * Of the two preferences, the ones still worth asking: unanswered, not waved
   * away this sitting, and only once nothing a live profile needs is missing —
   * a preference never delays one of the eight.
   */
  const preferencesLeft = useCallback((): BoloPreferenceKey[] => {
    const values = draftRef.current.values;
    if (missingMinimum(values).length > 0) return [];
    return missingPreferences(values).filter((key) => !skippedPrefsRef.current.includes(key));
  }, []);

  /**
   * What the model should do once the contact step is behind it — or, for a
   * member (who has no contact step), once the review is confirmed.
   */
  const nextAfterContact = useCallback((): "preferences" | "finish" => {
    // Normally nothing is left: the round happens on screen, right after the
    // eighth answer. What reaches here is the sitting that was cut short — a
    // dropped session, a reload on the contact step — never one of the two the
    // person already said "Abhi nahi" to.
    return preferencesLeft().length > 0 ? "preferences" : "finish";
  }, [preferencesLeft]);

  /** Whether a code can reach this contact at all — its own channel, not "is any OTP configured". */
  const canSendCodeTo = useCallback(
    (raw: string) => (raw.includes("@") ? channels.email : channels.mobile),
    [channels.email, channels.mobile],
  );

  /* ------------------------------ leaving ----------------------------- */

  /** Where Continue / `go_next` goes: the reel for a live profile, the server's landing otherwise. */
  const nextTarget = useCallback((): string => {
    const current = doneRef.current;
    if (!current) return REEL_PATH;
    return current.live ? REEL_PATH : current.landing;
  }, []);

  /**
   * The one place the page leaves from. Stops the mic, the speaker and the
   * socket, clears the goodbye timer, and navigates exactly once — a second
   * call (the timer firing after the goodbye already did it, a double tap on
   * Continue, a model calling `go_next` twice) is a no-op.
   */
  const leaveNow = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    sessionRef.current?.stop("finished");
    sessionRef.current = null;
    const target = nextTarget();
    router.replace(target);
    router.refresh();
  }, [nextTarget, router]);

  /**
   * Arm the exit: no further answers reach the model, and the page leaves as
   * soon as Grio's goodbye has played — or after `GOODBYE_GRACE_MS`, whichever
   * comes first. Without a live session there is no goodbye to wait for.
   */
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
    leaveTimer.current = window.setTimeout(leaveNow, GOODBYE_GRACE_MS);
  }, [leaveNow]);

  /* ------------------------------ network ------------------------------ */

  const sendOtp = useCallback(async (rawContact: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact: rawContact }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        masked?: string;
        existingUser?: boolean;
        retryAfterSeconds?: number;
      };
      if (body.ok) {
        setOtp({ phase: "sent", masked: body.masked ?? null, existingUser: Boolean(body.existingUser), error: null, cooldown: 60 });
        setCode("");
        return { status: "sent" as const, masked: body.masked ?? "", existingUser: Boolean(body.existingUser) };
      }
      if (body.error === "not_configured") {
        setOtp((o) => ({ ...o, phase: "skipped", existingUser: Boolean(body.existingUser), error: null }));
        return { status: "skipped" as const, existingUser: Boolean(body.existingUser) };
      }
      if (body.error === "invalid") {
        setOtp((o) => ({ ...o, phase: "enter", error: body.message ?? null }));
        return { status: "invalid" as const };
      }
      if (body.error === "cooldown" || body.error === "rate_limited") {
        setOtp((o) => ({ ...o, error: body.message ?? null, cooldown: body.retryAfterSeconds ?? o.cooldown }));
        return { status: "rate_limited" as const, retryAfterSeconds: body.retryAfterSeconds ?? 60 };
      }
      setOtp((o) => ({ ...o, error: body.message ?? t("bolo.error.otpSend", "OTP nahi bheja ja saka.") }));
      return { status: "error" as const, message: body.message ?? "" };
    } catch {
      setOtp((o) => ({ ...o, error: t("auth.error.network", "Network error — dobara try karein.") }));
      return { status: "error" as const, message: "network" };
    } finally {
      setBusy(false);
    }
  }, [t]);

  const verifyOtp = useCallback(async (rawCode: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact: contactRef.current, code: rawCode }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        proof?: string;
        error?: string;
        message?: string;
        attemptsLeft?: number;
        existingUser?: boolean;
      };
      if (body.ok && body.proof) {
        proofRef.current = body.proof;
        setOtp((o) => ({ ...o, phase: "verified", error: null, existingUser: Boolean(body.existingUser) }));
        haptic("success");
        return { status: "verified" as const, existingUser: Boolean(body.existingUser) };
      }
      const error = body.message ?? t("bolo.error.otpWrong", "Code galat hai.");
      if (body.error === "expired" || body.error === "no_challenge" || body.error === "too_many_attempts") {
        setOtp((o) => ({ ...o, phase: "enter", error }));
        return { status: "expired" as const };
      }
      setOtp((o) => ({ ...o, error }));
      return { status: "wrong" as const, attemptsLeft: body.attemptsLeft ?? null };
    } catch {
      setOtp((o) => ({ ...o, error: t("auth.error.network", "Network error — dobara try karein.") }));
      return { status: "error" as const };
    } finally {
      setBusy(false);
    }
  }, [t]);

  /**
   * The profile — and, for a guest, the account and the session — in one
   * request. Idempotent: once it has succeeded, every later call answers with
   * the same result and touches nothing, so a model that calls `finish` twice
   * creates one account. Never navigates; that is `go_next` / Continue.
   */
  const completeAccount = useCallback(async () => {
    if (finishedRef.current) {
      const previous = doneRef.current;
      return previous?.live
        ? { status: "live" as const, alreadyFinished: true }
        : { status: "saved" as const, alreadyFinished: true, missing: labelsFor(missingMinimum(draftRef.current.values)) };
    }
    const current = draftRef.current;
    if (!member && !contactRef.current.trim()) return { status: "needs_contact" as const };
    setBusy(true);
    try {
      const res = await fetch("/api/bolo/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          member
            ? // Signed in: the server reads who from the session, never from here.
              { fillingFor: current.fillingFor ?? "self", values: current.values }
            : {
                fillingFor: current.fillingFor ?? "self",
                // The eight fields and, when the visitor gave them, the two
                // preferences — one payload, one `acceptAnswers`, one `saveDraft`.
                values: current.values,
                contact: contactRef.current,
                accountName: accountNameRef.current || undefined,
                proof: proofRef.current ?? undefined,
                // Only ever the person's own, typed on the contact step when no
                // code can reach their contact; the server refuses that account
                // without one.
                password: accountPasswordRef.current || undefined,
              },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        live?: boolean;
        landing?: string;
        existingAccount?: boolean;
        hasPassword?: boolean;
        error?: string;
        message?: string;
        missing?: string[];
      };
      if (body.ok && body.landing) {
        const result: Done = {
          landing: body.landing,
          live: Boolean(body.live),
          existingAccount: Boolean(body.existingAccount),
          hasPassword: Boolean(body.hasPassword),
        };
        finishedRef.current = true;
        doneRef.current = result;
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* nothing to clear */
        }
        setDone(result);
        setStage("done");
        haptic("success");
        return body.live ? { status: "live" as const } : { status: "saved" as const, missing: labelsFor(body.missing ?? []) };
      }
      if (body.error === "WRONG_ACCOUNT") {
        router.replace(body.landing ?? "/");
        return { status: "error" as const, message: body.message ?? "" };
      }
      if (body.error === "PASSWORD_REQUIRED") {
        setNotice(body.message ?? t("bolo.error.passwordRequired", "Aage badhne ke liye apna password banaiye."));
        return { status: "needs_password" as const };
      }
      if (body.error === "VERIFICATION_REQUIRED") {
        setOtp((o) => ({ ...o, phase: "enter", error: body.message ?? null }));
        return { status: "verification_required" as const };
      }
      if (body.error === "ALREADY_EXISTS") {
        setNotice(body.message ?? t("bolo.error.exists", "Is number se account pehle se hai — login kar lijiye."));
        setOtp((o) => ({ ...o, phase: "enter", error: null, existingUser: true }));
        return { status: "already_registered" as const, otpSent: false };
      }
      setNotice(body.message ?? t("bolo.error.complete", "Profile save nahi ho payi. Ek baar phir try karein."));
      return { status: "error" as const, message: body.message ?? "" };
    } catch {
      setNotice(t("auth.error.network", "Network error — dobara try karein."));
      return { status: "error" as const, message: "network" };
    } finally {
      setBusy(false);
    }
  }, [member, router, storageKey, t]);

  /**
   * Preferences that arrive *after* `finish` — the model skipped the step and
   * came back to it. The profile exists and the visitor is signed in, so the
   * ordinary autosave persists them, with the same user-confirmed provenance
   * the deck records. Not a second completion; the account is never touched.
   */
  const persistLatePreferences = useCallback(async (keys: BoloPreferenceKey[]) => {
    const values: Record<string, string> = {};
    for (const key of keys) if (draftRef.current.values[key]) values[key] = draftRef.current.values[key];
    if (Object.keys(values).length === 0) return true;
    try {
      const res = await fetch("/api/profile/save-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values,
          meta: Object.fromEntries(Object.keys(values).map((key) => [key, { source: "user", confirmed: true }])),
          fillingFor: draftRef.current.fillingFor ?? "self",
        }),
      });
      return res.ok;
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
            // Every answer the draft holds, values and all — the model's memory
            // of this conversation rather than its recollection of it. A live
            // session that dropped and restarted, or simply ran long, used to
            // come back not knowing the name it had been given; now every tool
            // round-trip hands it back.
            filled: { ...draftRef.current.values },
            fillingFor: draftRef.current.fillingFor,
            // The step the screen is on, so the voice asks what the screen is
            // asking: the rest of the eight, then the two preferences, then the review.
            next: result.missing.length > 0 ? "answers" : preferencesLeft().length > 0 ? "preferences" : "review",
          };
        }
        case "show_review": {
          const missingNow = missingMinimum(draftRef.current.values);
          const prefsLeft = preferencesLeft();
          if (prefsLeft.length > 0) {
            // The screen is still on question nine or ten. Moving it to the
            // review now would take that question away unanswered, so the card
            // waits and the model is sent back to the step it skipped.
            return {
              shown: false,
              next: "preferences",
              pending: prefsLeft,
              hint: "Pehle screen par khadi 2 pasand wali baat poori karo (user skip bhi kar sakta hai), phir show_review.",
            };
          }
          setStage("review");
          haptic("tap");
          return { shown: true, filled: { ...draftRef.current.values }, missing: missingNow };
        }
        case "confirm_review": {
          // Already past this point: say so, move nothing backwards.
          if (finishedRef.current) return { status: "confirmed", alreadyConfirmed: true, next: "go_next" };
          const missingNow = missingMinimum(draftRef.current.values);
          if (missingNow.length > 0) {
            // A spoken "haan" over an incomplete card is not a review — the
            // contact step stays closed until the eight are really in.
            if (stageRef.current === "contact") setStage("review");
            return { status: "incomplete", missing: missingNow, missingLabels: labelsFor(missingNow) };
          }
          if (member) {
            // No contact step for someone already signed in: the review stays on
            // screen, now confirmed, and next is the preferences or the finish.
            const alreadyConfirmed = draftRef.current.confirmed;
            if (!alreadyConfirmed) commitDraft({ ...draftRef.current, confirmed: true, updatedAt: Date.now() });
            if (stageRef.current !== "review") setStage("review");
            haptic("tap");
            return { status: "confirmed", alreadyConfirmed, next: nextAfterContact() };
          }
          const alreadyConfirmed = draftRef.current.confirmed && stageRef.current === "contact";
          if (!draftRef.current.confirmed) commitDraft({ ...draftRef.current, confirmed: true, updatedAt: Date.now() });
          if (stageRef.current !== "contact") {
            setStage("contact");
            haptic("tap");
          }
          return { status: "confirmed", alreadyConfirmed, next: "contact" };
        }
        case "request_otp": {
          // Not in the member tool list at all; a model that calls it anyway is
          // told why, and pointed on.
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
          if (result.status === "sent" && result.existingUser) {
            return { status: "already_registered", otpSent: true, masked: result.masked };
          }
          if (result.status === "skipped" && result.existingUser) {
            return { status: "already_registered", otpSent: false };
          }
          // No code can reach this number: the contact step now shows the
          // password field, and `finish` waits for it.
          if (result.status === "skipped") return { ...result, next: nextAfterContact(), passwordRequired: true };
          return result;
        }
        case "verify_otp": {
          if (member) return { status: "not_needed", next: nextAfterContact() };
          const rawCode = String(call.args.code ?? "").replace(/\D/g, "");
          setCode(rawCode.slice(0, 6));
          const result = await verifyOtp(rawCode);
          if (result.status === "verified") return { ...result, next: nextAfterContact() };
          return result;
        }
        case "save_preferences": {
          const { confirmed, ...fields } = call.args;
          // Nothing is stored on the model's say-so alone: the visitor has to
          // have heard the values read back and said yes.
          if (confirmed !== true) {
            return {
              status: "not_confirmed",
              saved: [],
              hint: "Pehle values padh kar sunao aur 'sahi?' poochho; user haan bole to confirmed: true ke saath dobara bhejo.",
            };
          }
          const result = applyPreferences(fields);
          const response: Record<string, unknown> = {
            saved: result.saved,
            rejected: result.rejected.map((r) => ({ field: r.field, heard: r.heard, options: r.options })),
            ignored: result.ignored,
            missing: result.missing,
            filled: { ...draftRef.current.values },
          };
          if (finishedRef.current) {
            // Late — the profile already exists; persist through the signed-in autosave.
            const ok = result.saved.length === 0 || (await persistLatePreferences(result.saved));
            return { ...response, status: ok ? (result.saved.length > 0 ? "saved" : "nothing_saved") : "error", next: "go_next" };
          }
          // Asked in its own place — before the review — the step after it is
          // the review; asked late (the review already behind us) it is the finish.
          const next =
            preferencesLeft().length > 0
              ? "preferences"
              : draftRef.current.confirmed || stageRef.current === "contact"
                ? "finish"
                : "review";
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
            if (!contactRef.current.trim()) {
              return { status: "needs_contact", missing: labelsFor(missingNow) };
            }
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
          return { status: "leaving", target: nextTarget(), hint: "Ek shabd me alvida bolo, phir kuch mat bolo." };
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
      nextTarget,
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
          // The goodbye has been said and has finished playing — go.
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
            // The caption in the voice bar. `grioBuf` is cleared at the end of
            // every turn, so this shows her current sentence from its start —
            // and, in the silence after it, keeps the last one up.
            setGrioNow(grioBuf.current);
            if (leavingRef.current) goodbyeHeardRef.current = true;
            // The question on screen follows the one Grio is actually asking out loud.
            if (stageRef.current === "start" || stageRef.current === "talking") {
              const current = draftRef.current;
              const asked = detectAskedField(
                grioBuf.current,
                pendingAskKeys(current.fillingFor, current.values, skippedPrefsRef.current),
              );
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
            if (leavingRef.current && goodbyeHeardRef.current && sessionRef.current?.currentStatus !== "speaking") {
              leaveNow();
            }
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
            // Whatever ended the session, the visitor already said "chalein".
            leaveNow();
            break;
          }
          setDropped(event.reason !== "user" && event.reason !== "finished");
          if (event.reason === "idle") setNotice(t("bolo.notice.idle", "Kaafi der se awaaz nahi aayi — baat-cheet rok di. Phir se shuru kar sakte hain."));
          else if (event.reason === "network" || event.reason === "go_away")
            setNotice(t("bolo.notice.dropped", "Connection toot gaya. Jo bhar gaya wo safe hai — phir se shuru karein ya type karein."));
          else if (event.reason === "max_session")
            setNotice(t("bolo.notice.maxSession", "Ek session ki seema aa gayi. Jo bhar gaya wo safe hai — phir se shuru karein."));
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
          setNotice(failureCopy(event.failure, t));
          if (stageRef.current === "talking" && Object.keys(draftRef.current.values).length === 0) setStage("start");
          break;
      }
    },
    [leaveNow, t],
  );

  const startVoice = useCallback(async () => {
    if (sessionRef.current || leavingRef.current) return;
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
    const session = new GrioLiveSession(
      {
        onEvent: onLiveEvent,
        onToolCalls: async (calls) => {
          const out: Array<Record<string, unknown>> = [];
          for (const call of calls) out.push(await runTool(call));
          return out;
        },
      },
      // Built at the moment of starting, so answers tapped, typed or uploaded
      // before the mic was switched on count as already given.
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
    haptic("tap");
    await session.start();
  }, [member, onLiveEvent, preferencesLeft, runTool]);

  /**
   * Stop ends the session and nothing else: the question stays where it was,
   * and the chips and the keyboard carry on from there.
   */
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
    haptic("tap");
  }, [startVoice]);

  /* ----------------------------- answers ------------------------------ */

  /**
   * Where the conversation stands, in the words the page's bracketed notes use
   * — the same ladder the screen itself follows (`pendingAskKeys`), so Grio is
   * never a step behind the question on screen.
   */
  const nextNote = useCallback((): string => {
    const values = draftRef.current.values;
    // The answers themselves, not only their names: the same reason the
    // kickoffs carry values. A note that said "Baaki: Height, Education" left
    // a model that had lost the thread free to re-ask the name it already had.
    const known = MINIMUM_LIVE_KEYS.filter((key) => values[key])
      .map((key) => `${FIELD_BY_KEY[key]?.label ?? key} = "${unbracket(values[key] ?? "")}"`)
      .join(", ");
    const already = known ? `Ab tak bhara hua (ye ho chuka — dobara mat poochho): ${known}. ` : "";
    const missingNow = missingMinimum(values);
    if (missingNow.length > 0) {
      return `${already}Baaki: ${labelsFor(missingNow).join(", ")} — inme se ek baar me sirf EK poochho.`;
    }
    const prefsLeft = missingPreferences(values).filter((key) => !skippedPrefsRef.current.includes(key));
    if (prefsLeft.length > 0) {
      return `${already}Sab 8 bhar gaye. Ab screen par optional pasand poochhi ja rahi hai — ${labelsFor(prefsLeft).join(", ")}. Wahi ek-ek karke poochho, phir show_review.`;
    }
    return `${already}Sab 8 bhar gaye aur 2 pasand ka step poora ho gaya — ab show_review call karke poochho 'sahi hai?'.`;
  }, []);

  /**
   * An answer given on screen, told to a live Grio in the page's bracketed
   * voice — so she moves on to what is still missing instead of asking it
   * again. Only ever `sendText` on the open session: nothing here starts,
   * stops or restarts it.
   */
  const tellGrio = useCallback((key: string, source: "chip" | "typed") => {
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
    session.sendText(
      `[User ne screen par ${source === "chip" ? "tap karke" : "likh kar"} jawab diya: ${what} — save ho gaya.${who} ${nextNote()}]`,
    );
  }, [nextNote]);

  /**
   * "Abhi nahi" on one of the two preferences. Nothing is stored — not even an
   * empty value, which would be an answer — and Grio is told to let it go, so
   * neither the screen nor the voice comes back to it.
   */
  const skipAsk = useCallback(
    (key: string) => {
      if (leavingRef.current || !isPreferenceAsk(key) || skippedPrefsRef.current.includes(key)) return;
      const next = [...skippedPrefsRef.current, key];
      skippedPrefsRef.current = next;
      setSkippedPrefs(next);
      setRejected(null);
      haptic("tap");
      if (stageRef.current === "start") setStage("talking");
      sessionRef.current?.sendText(
        `[User ne screen par "${FIELD_BY_KEY[key]?.label ?? key}" wali pasand abhi ke liye rehne di — ise dobara mat poochho. ${nextNote()}]`,
      );
    },
    [nextNote],
  );

  /**
   * A tapped chip, or a typed line that is a bare answer to the question on
   * screen: into the draft on the spot, into the bubble, and — with Grio live —
   * told to her. The same value again is not a new answer.
   */
  const answerOnScreen = useCallback(
    (key: string, value: string, source: "chip" | "typed") => {
      if (leavingRef.current) return;
      const before = draftRef.current;
      if (key === FILLING_FOR_ASK) {
        if (!isFillingFor(value) || before.fillingFor === value) return;
        setWho(value);
        haptic("tap");
      } else if (isBoloPreferenceKey(key)) {
        // The same narrow door the model's answers go through: only the two
        // keys, validated against the catalog, and never a touch of `confirmed`
        // — a preference is not a change to the eight the review is about.
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
        setComposerHint(chip.placeholderKey ? t(chip.placeholderKey, chip.placeholder ?? "") : (chip.placeholder ?? null));
        composerRef.current?.focus();
        return;
      }
      answerOnScreen(key, chip.value, "chip");
    },
    [answerOnScreen, skipAsk, t],
  );

  const submitTyped = useCallback(async () => {
    const text = typed.trim();
    if (!text || leavingRef.current) return;
    setTyped("");
    setComposerHint(null);
    const conversingNow = stageRef.current === "start" || stageRef.current === "talking";
    const key = conversingNow ? heroKeyRef.current : null;

    if (sessionRef.current && liveActive) {
      // Typed to a live Grio is the same as said to her: she reads it, saves
      // what fits through `save_answers`, and the bubble ticks when she does.
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
      const res = await fetch("/api/profile/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          knownFields: draftRef.current.values,
          fillingFor: draftRef.current.fillingFor ?? "self",
          // The question on screen, so a short "Jaipur" is read as the city it answers.
          askedField: key && key !== FILLING_FOR_ASK ? key : undefined,
        }),
      });
      const body = (await res.json()) as InterviewResponse;
      if (!body.ok) {
        setNotice(body.message);
        return;
      }
      const incoming: Record<string, string> = {};
      for (const f of body.result.extractedFields) if (f.value) incoming[f.field] = f.value;
      const before = draftRef.current;
      const result = applyAnswers(incoming);
      noteAccepted(before, "typed");
      if (result.saved.length === 0) {
        setNotice(t("bolo.notice.nothingFound", "Isme se koi profile detail samajh nahi aayi — naam, DOB, city jaise details likhiye."));
      } else if (stageRef.current === "start") {
        setStage("talking");
      }
    } catch {
      setNotice(t("auth.error.network", "Network error — dobara try karein."));
    } finally {
      setExtracting(false);
    }
  }, [answerOnScreen, applyAnswers, liveActive, noteAccepted, t, typed]);

  const uploadBiodata = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setExtracting(true);
      setNotice(null);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("fillingFor", draftRef.current.fillingFor ?? "self");
        const res = await fetch("/api/profile/biodata", { method: "POST", body: form });
        const body = (await res.json()) as BiodataResponse;
        if (!body.ok) {
          setNotice(body.message);
          return;
        }
        const incoming: Record<string, string> = {};
        for (const f of body.result.extractedFields) if (f.value) incoming[f.field] = f.value;
        const before = draftRef.current;
        const result = applyAnswers(incoming);
        noteAccepted(before, "biodata");
        const count = result.saved.filter((k) => (MINIMUM_LIVE_KEYS as readonly string[]).includes(k)).length;
        setNotice(
          count > 0
            ? `${t("bolo.notice.biodataRead", "Biodata se")} ${count} ${t("bolo.notice.biodataFields", "details mil gayi — check kar lijiye.")}`
            : t("bolo.notice.biodataEmpty", "Biodata se zaroori details nahi mili — bol kar ya type karke bharein."),
        );
        // A biodata can fill all eight at once; the two preferences are still
        // questions on screen, so the review only takes over once they are past.
        if (result.missing.length === 0 && preferencesLeft().length === 0) setStage("review");
        else if (stageRef.current === "start") setStage("talking");
        sessionRef.current?.sendText(`[User ne biodata upload kiya; ye fields bhar gaye: ${result.saved.join(", ") || "koi nahi"}]`);
      } catch {
        setNotice(t("auth.error.network", "Network error — dobara try karein."));
      } finally {
        setExtracting(false);
      }
    },
    [applyAnswers, noteAccepted, preferencesLeft, t],
  );

  /* ------------------------------ actions ----------------------------- */

  const confirmReview = useCallback(() => {
    if (missingMinimum(draftRef.current.values).length > 0) return;
    haptic("tap");
    commitDraft({ ...draftRef.current, confirmed: true, updatedAt: Date.now() });
    setStage("contact");
    sessionRef.current?.sendText("[User ne review card par 'sahi hai' dabaya — review confirmed; ab contact poochho]");
  }, [commitDraft]);

  const uiSendOtp = useCallback(async () => {
    setNotice(null);
    const result = await sendOtp(contactRef.current);
    if (result.status === "sent") sessionRef.current?.sendText(`[User ne type karke number diya; OTP bhej diya gaya ${result.masked} par — ab code poochho]`);
  }, [sendOtp]);

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

  /** A member's "All Correct — Go Live": the review confirmed and the profile finished in one tap. */
  const memberGoLive = useCallback(async () => {
    if (missingMinimum(draftRef.current.values).length > 0) return;
    haptic("tap");
    commitDraft({ ...draftRef.current, confirmed: true, updatedAt: Date.now() });
    await uiFinish();
  }, [commitDraft, uiFinish]);

  /**
   * The done screen's optional password, through `/api/auth/password` — which
   * asks for no current password on an account that has none. `announce` tells
   * Grio it happened, so she can move on to "chalein?"; Continue does not, it
   * is already leaving.
   */
  const savePassword = useCallback(
    async (announce: boolean): Promise<boolean> => {
      const value = newPasswordRef.current;
      if (!isAcceptablePassword(value)) {
        setPasswordError(
          `${t("bolo.password.helpPrefix", "Kam se kam")} ${PASSWORD_MIN_LENGTH} ${t("bolo.setPassword.tooShortSuffix", "characters ka password chahiye.")}`,
        );
        return false;
      }
      setPasswordBusy(true);
      setPasswordError(null);
      try {
        const res = await fetch("/api/auth/password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ new_password: value }),
        });
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          setPasswordError(body.message ?? t("bolo.setPassword.failed", "Password save nahi ho paya."));
          return false;
        }
        passwordSavedRef.current = true;
        setPasswordSaved(true);
        haptic("success");
        if (announce) {
          sessionRef.current?.sendText(
            "[User ne screen par apna password bana liya — ek shabd me 'Badhiya' bolo, phir EK baar poochho 'Rishte dekhein — chalein?'; haan par go_next]",
          );
        }
        return true;
      } catch {
        setPasswordError(t("auth.error.network", "Network error — dobara try karein."));
        return false;
      } finally {
        setPasswordBusy(false);
      }
    },
    [t],
  );

  /**
   * Continue / See Matches. A password typed and not saved is not walked away
   * from silently: a valid one is saved first (that is what someone who typed
   * it and tapped Continue meant), a too-short one stops here with the reason.
   */
  const continueFromDone = useCallback(async () => {
    if (newPasswordRef.current && !passwordSavedRef.current) {
      const saved = await savePassword(false);
      if (!saved) return;
    }
    beginLeaving();
  }, [beginLeaving, savePassword]);

  /** The way out for a member on the wrong account or someone else's phone — this page has no nav. */
  const logout = useCallback(async () => {
    sessionRef.current?.stop("user");
    sessionRef.current = null;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* the navigation below still leaves this screen */
    }
    router.replace("/login");
    router.refresh();
  }, [router]);

  /* ------------------------------ screen ------------------------------ */

  // The question on screen: the next one Grio needs — held back for a moment
  // after an answer, so the ✓ lands before the next card slides in.
  useEffect(() => {
    if (heroKey === targetKey) return;
    // Everything answered: the last question stays up until the review takes its place.
    if (conversing && targetKey === null) return;
    if (conversing && heroKey !== null && !pending.includes(heroKey)) {
      const timer = window.setTimeout(() => setHeroKey(targetKey), ACK_MS);
      return () => window.clearTimeout(timer);
    }
    setHeroKey(targetKey);
  }, [conversing, heroKey, pending, targetKey]);

  useEffect(() => {
    if (voiceFocus !== null && !pending.includes(voiceFocus)) setVoiceFocus(null);
  }, [pending, voiceFocus]);

  useEffect(() => {
    if (rejected !== null && !pending.includes(rejected.key)) setRejected(null);
  }, [pending, rejected]);

  useEffect(() => {
    setComposerHint(null);
  }, [heroKey]);

  // All eight in, and who the profile is for: the review, once the last ✓ has
  // landed. Grio's own `show_review` gets there too — whichever comes first,
  // it is the same step.
  useEffect(() => {
    if (!hydrated || !conversing || pending.length > 0) return;
    const timer = window.setTimeout(() => {
      if (!leavingRef.current && (stageRef.current === "start" || stageRef.current === "talking")) setStage("review");
    }, ACK_MS);
    return () => window.clearTimeout(timer);
  }, [conversing, hydrated, pending.length]);

  // With the keyboard up, the question and its chips are what must stay in view.
  useEffect(() => {
    if (keyboardOpen && conversing) {
      questionRef.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    }
  }, [conversing, keyboardOpen, reduced]);

  /* ------------------------------- render ----------------------------- */

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  const total = MINIMUM_LIVE_KEYS.length;
  const doneCount = total - missing.length;
  const hasAnswers = Object.keys(draft.values).length > 0;

  const preferenceLines = (Object.entries(savedPreferences) as Array<[BoloPreferenceKey, string]>).map(([key, value]) => ({
    key,
    label: FIELD_BY_KEY[key]?.label ?? key,
    value,
  }));

  const memberGreeting = member ? [t("bolo.member.hello", "Namaste"), member.firstName].filter(Boolean).join(" ") : "";
  const memberTitle = !member
    ? null
    : missing.length >= MINIMUM_LIVE_KEYS.length
      ? `${memberGreeting}, ${t("bolo.member.titleFresh", "chaliye profile banate hain")}`
      : missing.length === 0
        ? `${memberGreeting} — ${t("bolo.member.leftNone", "profile ki zaroori baatein poori hain")}`
        : missing.length === 1
        ? `${memberGreeting} — ${t("bolo.member.leftOne", "bas 1 baat baaki hai")}`
        : `${memberGreeting} — ${t("bolo.member.leftPrefix", "bas")} ${missing.length} ${t("bolo.member.leftSuffix", "baatein baaki hain")}`;

  /** A stored value the way its chip says it ("Ladka" is "Male" on an English screen); a date the way people say it. */
  const answerText = (key: string, value: string): string => {
    if (key === "dateOfBirth") return displayDate(value);
    const chip = chipFor(key, value, draft.values);
    return chip ? (chip.labelKey ? t(chip.labelKey, chip.label) : chip.label) : value;
  };

  let bubble: BubbleContent | null = null;
  if (latest?.kind === "sent") {
    bubble = { id: latest.id, text: latest.text, state: "sent" };
  } else if (latest?.kind === "accepted") {
    const accepted = latest;
    if (accepted.source === "biodata") {
      bubble = {
        id: accepted.id,
        text: `${t("bolo.bubble.biodata", "Biodata")} · ${accepted.keys.length} ${t("bolo.profile.details", "details")}`,
        state: "accepted",
      };
    } else {
      const parts = [
        ...(accepted.fillingFor ? [answerText(FILLING_FOR_ASK, accepted.fillingFor)] : []),
        // "Bete ke liye" already says the gender it filled in.
        ...accepted.keys
          .filter((key) => !(key === "gender" && accepted.fillingFor))
          .map((key) => answerText(key, accepted.values[key] ?? "")),
      ];
      if (parts.length > 0) {
        bubble = {
          id: accepted.id,
          text: parts.length > 2 ? `${parts.slice(0, 2).join(", ")} +${parts.length - 2}` : parts.join(", "),
          state: "accepted",
        };
      }
    }
  }

  const ask = conversing && heroKey ? askFor(heroKey, draft.fillingFor, draft.values) : null;
  const askHint = !ask
    ? null
    : rejected && rejected.key === ask.key
      ? `“${rejected.heard}” — ${t("bolo.ask.retry", "ye theek se samajh nahi aaya, ek baar phir bataiye")}`
      : ask.optional
        ? t("bolo.ask.preferenceWhy", "Isse rishte aapki pasand ke hisaab se chunenge — abhi nahi bhi chalega.")
        : ask.chips.length > 0
        ? voiceSupported
          ? t("bolo.ask.anyWay", "Tap karein, likhein, ya bol dein")
          : t("bolo.ask.anyWayNoVoice", "Tap karein ya likh dein")
        : ask.hint
          ? t(ask.hintKey ?? "", ask.hint)
          : null;

  const card = ask
    ? {
        id: ask.key,
        question: t(ask.questionKey, ask.question),
        hint: askHint,
        // Question nine and ten come after a full 8/8 header; the eyebrow says
        // why the conversation has not stopped, and that these two are extra.
        eyebrow: ask.optional
          ? t("bolo.ask.preferenceEyebrow", "Zaroori baatein poori — bas 2 aakhri sawaal")
          : stage === "start"
            ? memberTitle
            : null,
      }
    : stage === "review"
      ? {
          id: "review",
          question: t("bolo.review.ask", "Ek baar dekh lijiye — sab sahi hai?"),
          hint: t("bolo.review.hint", "Kuch galat ho to us line par tap karke badal dijiye."),
          eyebrow: null,
        }
      : stage === "contact" && !member
        ? {
            id: "contact",
            question: isComplete
              ? t("bolo.contact.title", "Bas ek number, aur profile live")
              : t("bolo.contact.titleDraft", "Number dijiye, draft save ho jayega"),
            hint: t("bolo.contact.subtitle", "Isi se aap wapas login karenge."),
            eyebrow: null,
          }
        : null;

  const chips = ask
    ? ask.chips.map((chip, index) => ({
        id: String(index),
        label: chip.labelKey ? t(chip.labelKey, chip.label) : chip.label,
        selected:
          chip.value === null
            ? undefined
            : ask.key === FILLING_FOR_ASK
              ? draft.fillingFor === chip.value
              : draft.values[ask.key] === chip.value,
      }))
    : [];

  const barMode: VoiceBarMode = leaving ? "leaving" : liveActive ? "live" : !voiceSupported ? "off" : dropped ? "retry" : "idle";
  /**
   * The one input the aurora takes (globals.css, `.bolo-stage`). It follows the
   * session and nothing else: no tap, no stage, no answer changes it, so the
   * light can only ever mean "the microphone is open", and "idle" — a closed,
   * failed or never-started session — fades it out.
   */
  const voiceState: "connecting" | "speaking" | "listening" | "idle" = !liveActive
    ? "idle"
    : liveStatus === "connecting"
      ? "connecting"
      : liveStatus === "speaking"
        ? "speaking"
        : "listening";
  const micState: ComposerMicState = !liveActive
    ? "idle"
    : liveStatus === "connecting"
      ? "connecting"
      : muted
        ? "muted"
        : liveStatus === "speaking"
          ? "speaking"
          : "listening";
  const showComposer = !leaving && (conversing || stage === "review" || (stage === "done" && liveActive));
  const composerStatus =
    liveActive && liveStatus !== "connecting"
      ? muted
        ? t("bolo.composer.muted", "Mic band hai · tap karke ya likh kar jawab dein")
        : t("bolo.composer.live", "Live chalu hai · jawab kisi bhi tarah dein")
      : null;

  const accountLine = member ? (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <span>
        {t("bolo.member.signedInAs", "Login:")} <span className="font-medium text-ink">{member.fullName}</span>
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex min-h-8 items-center gap-1 font-semibold text-primary-text underline-offset-4 hover:underline"
      >
        <LogOut className="size-3.5" />
        {t("bolo.member.logout", "Log out")}
      </button>
    </span>
  ) : (
    <span>
      {t("bolo.footer.haveAccount", "Pehle se account hai?")}{" "}
      <Link href="/login" className="font-semibold text-primary-text underline-offset-4 hover:underline">
        {t("bolo.footer.login", "Login")}
      </Link>
    </span>
  );

  const sheetFooter = (
    <div className="flex flex-col items-start gap-2.5 text-sm text-muted">
      {!member && !isComplete && hasAnswers && stage !== "contact" && (
        <button
          type="button"
          onClick={() => {
            setSheetOpen(false);
            setStage("contact");
          }}
          className="min-h-8 font-semibold text-primary-text underline-offset-4 hover:underline"
        >
          {t("bolo.review.saveDraft", "Save Draft & Create Account")}
        </button>
      )}
      {member && (
        <button
          type="button"
          onClick={() => router.push(MANUAL_DECK_PATH)}
          className="inline-flex min-h-8 items-center gap-1.5 font-semibold text-primary-text underline-offset-4 hover:underline"
        >
          <ListChecks className="size-4" />
          {t("bolo.member.fullForm", "Open Full Form")}
        </button>
      )}
      {accountLine}
    </div>
  );

  return (
    <div
      className="bolo-stage mx-auto flex flex-col px-[14px]"
      data-voice-state={voiceState}
      // The dock measures itself including the inset it keeps below the shell's
      // rim, and that inset is already this element's bottom margin — counting
      // it twice pushed the shell's foot off the bottom of the screen.
      style={{ paddingBottom: showComposer ? Math.max(0, composerHeight + keyboardInset - 14) : 34 }}
    >
      {/* The pane the whole conversation is written on: a rounded sheet of warm
          glass with a gold rim, drawn as a child rather than as this element's
          own background — `backdrop-filter` on an ancestor would make it the
          containing block for the composer and the profile sheet, both of which
          are `position: fixed` and must stay pinned to the viewport. */}
      <div className="bolo-shell" aria-hidden />

      <BoloHeader done={doneCount} total={total} />

      <div className="mt-[15px] space-y-[13px]">
        {(stage !== "done" || liveActive || leaving) && (
          <LiveVoiceBar
            mode={barMode}
            status={liveStatus}
            level={level}
            muted={muted}
            heard={userNow}
            said={grioNow}
            noMic={voiceAvailable && !voiceSupported}
            onStart={() => void startVoice()}
            onStop={stopVoice}
          />
        )}

        {notice && (
          <div
            role="status"
            className="bolo-pane bolo-row flex items-start gap-2.5 py-2.5 pl-3.5 pr-2 text-sm leading-snug text-ink"
          >
            <Info className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
            <p className="min-w-0 flex-1">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label={t("bolo.notice.dismiss", "Close")}
              className="touch-target grid size-6 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {(conversing || stage === "contact") && (
          <ProfileSheet
            done={doneCount}
            total={total}
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            values={draft.values}
            fillingFor={draft.fillingFor}
            onChange={editField}
            highlight={highlight}
            footer={sheetFooter}
          />
        )}
      </div>

      <main className="mt-[15px] flex-1">
        {card && (
          <div ref={questionRef} className="scroll-mt-4">
            <GrioQuestion
              id={card.id}
              question={card.question}
              hint={card.hint}
              eyebrow={card.eyebrow}
              ack={conversing && ack ? t(ack.key, ack.fallback) : null}
            />
          </div>
        )}

        {/* ------------------------- conversation ------------------------- */}
        {conversing && (
          <>
            <AnswerBubble content={bubble} className={bubble ? "mt-[13px]" : undefined} />
            <div className={bubble ? "mt-[12px] grid" : "mt-[22px] grid"}>
              <AnimatePresence initial={false}>
                {ask && (
                  <motion.div
                    key={ask.key}
                    className="[grid-area:1/1]"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.26, ease: EASE_LUXE, delay: reduced ? 0 : 0.05 }}
                  >
                    <AnswerChips
                      chips={chips}
                      label={card?.question ?? ""}
                      disabled={leaving}
                      onPick={(id) => pickChip(ask.key, Number(id))}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {stage === "start" && !hasAnswers && (
              <div className="text-on-room mt-12 space-y-2 text-center text-xs leading-relaxed">
                <p className="text-pretty">
                  {t("bolo.hero.privacy", "Aapki baatein sirf profile bharne ke liye — kisi ko dikhengi nahi jab tak aap live na karein.")}
                </p>
                <p>{accountLine}</p>
              </div>
            )}
          </>
        )}

        {/* ---------------------------- review ---------------------------- */}
        {stage === "review" && (
          <div className="mt-6 space-y-4">
            <ProfileFillCard
              values={draft.values}
              fillingFor={draft.fillingFor}
              editable
              onChange={editField}
              highlight={highlight}
              className="bolo-glass-soft"
            />
            {/* Asked two questions ago now, so the review is where they are checked. */}
            {preferenceLines.length > 0 && (
              <div className="bolo-glass-soft rounded-xl px-3 py-2 text-xs text-ink">
                <p className="mb-1 font-semibold">{t("bolo.preferences.title", "Aapki pasand (profile ke saath save hogi)")}</p>
                <ul className="space-y-0.5">
                  {preferenceLines.map((line) => (
                    <li key={line.key}>
                      <span className="text-muted">{line.label}:</span> {line.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {member ? (
              <Button variant="accent" fullWidth disabled={!isComplete} loading={busy} onClick={() => void memberGoLive()}>
                {t("bolo.review.goLive", "All Correct — Go Live")}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="accent" fullWidth disabled={!isComplete} onClick={confirmReview}>
                {t("bolo.review.confirm", "All Correct — Continue")}
                <ArrowRight className="size-4" />
              </Button>
            )}
            {!isComplete && (
              <p className="text-center text-xs text-muted">
                {t("bolo.review.missing", "Abhi baaki:")} {labelsFor(missing).join(", ")}
              </p>
            )}
            {!isComplete && !member && (
              <Button variant="link" fullWidth onClick={() => setStage("contact")}>
                {t("bolo.review.saveDraft", "Save Draft & Create Account")}
              </Button>
            )}
            {member && <p className="pt-2 text-center text-xs text-muted">{accountLine}</p>}
          </div>
        )}

        {/* ---------------------------- contact --------------------------- */}
        {stage === "contact" && !member && (
          <section className="bolo-pane bolo-q__card mt-6 p-4 sm:p-5">
            <ContactStep
              fillingFor={draft.fillingFor}
              contact={contact}
              onContactChange={(v) => {
                setContact(v);
                if (otp.phase !== "enter") setOtp({ phase: "enter", masked: null, existingUser: false, error: null, cooldown: 0 });
                proofRef.current = null;
              }}
              accountName={accountName}
              onAccountNameChange={setAccountName}
              code={code}
              onCodeChange={setCode}
              password={accountPassword}
              onPasswordChange={setAccountPassword}
              complete={isComplete}
              otp={otp}
              busy={busy}
              channels={channels}
              onSend={() => void uiSendOtp()}
              onVerify={(c) => void uiVerify(c)}
              onFinishWithoutOtp={() => void uiFinish()}
            />
            {preferenceLines.length > 0 && (
              <div className="bolo-glass-soft mt-4 rounded-xl px-3 py-2 text-xs text-ink">
                <p className="mb-1 font-semibold">{t("bolo.preferences.title", "Aapki pasand (profile ke saath save hogi)")}</p>
                <ul className="space-y-0.5">
                  {preferenceLines.map((line) => (
                    <li key={line.key}>
                      <span className="text-muted">{line.label}:</span> {line.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {otp.phase === "verified" && (
              <Button className="mt-4" variant="accent" fullWidth loading={busy} onClick={() => void uiFinish()}>
                {isComplete ? t("bolo.contact.goLive", "Make Profile Live") : t("bolo.contact.saveDraft", "Save Draft & Continue")}
                <ArrowRight className="size-4" />
              </Button>
            )}
            {notice?.includes("login") && (
              <p className="mt-3 text-center text-sm">
                <Link href="/login" className="font-semibold text-primary-text underline-offset-4 hover:underline">
                  {t("bolo.contact.loginLink", "Login page par jayein")}
                </Link>
              </p>
            )}
          </section>
        )}

        {/* ----------------------------- done ----------------------------- */}
        {stage === "done" && done && (
          <section className="mx-auto max-w-md space-y-5 text-center">
            <span className="bolo-seal mx-auto grid size-14 place-items-center rounded-full text-[#f6b03c]">
              <Sparkles className="size-6" />
            </span>
            <h1 className="bt-display text-[2rem]">
              {done.live ? t("bolo.done.liveTitle", "Profile live hai 🎉") : t("bolo.done.savedTitle", "Account ban gaya")}
            </h1>
            <p className="text-pretty text-muted">
              {done.live
                ? t("bolo.done.liveBody", "Ab aapko rishte dikhne lagenge. Baaki details baad me bol kar bhar sakte hain.")
                : t("bolo.done.savedBody", "Profile draft save hai — bache hue sawaal andar poore kar lijiye.")}
            </p>
            {preferenceLines.length > 0 && (
              <ul className="mx-auto flex max-w-sm flex-wrap justify-center gap-2 text-xs">
                {preferenceLines.map((line) => (
                  <li key={line.key} className="bolo-chip inline-flex items-center gap-1 px-3 py-1 text-ink">
                    <Heart className="size-3 text-primary-text" />
                    <span className="text-ink/70">{line.label}:</span> {line.value}
                  </li>
                ))}
              </ul>
            )}
            {!done.hasPassword && (
              <SetPasswordCard
                value={newPassword}
                onChange={(value) => {
                  setNewPassword(value);
                  setPasswordError(null);
                }}
                saved={passwordSaved}
                busy={passwordBusy}
                error={passwordError}
                loginId={member ? undefined : contact.trim() || undefined}
                onSave={() => void savePassword(true)}
              />
            )}
            <Button variant="accent" fullWidth loading={leaving} disabled={passwordBusy} onClick={() => void continueFromDone()}>
              {done.live ? t("bolo.done.seeMatches", "See Matches") : t("bolo.done.continue", "Continue")}
              <ArrowRight className="size-4" />
            </Button>
            {!done.hasPassword && !passwordSaved && (
              <p className="text-xs text-muted">{t("bolo.setPassword.later", "Abhi nahi? Baad me App Setup me bhi bana sakte hain.")}</p>
            )}
            {liveActive && !leaving && (
              <p className="text-xs text-muted">
                {missingPreferences(draft.values).length > 0
                  ? t("bolo.done.grioStillHere", "Grio abhi bhi sun rahi hai — 2 pasand bata sakte hain, ya seedha aage badhein.")
                  : t("bolo.done.grioStillHereAsked", "Grio abhi bhi sun rahi hai — kuch aur poochhna ho to poochh lijiye.")}
              </p>
            )}
          </section>
        )}
      </main>

      {showComposer && (
        <AnswerComposer
          inputRef={composerRef}
          value={typed}
          onChange={setTyped}
          onSubmit={() => void submitTyped()}
          placeholder={
            composerHint ??
            (stage === "done"
              ? t("bolo.typed.placeholderLive", "Ya yahan likh dijiye — Grio padh legi")
              : t("bolo.composer.placeholder", "Jawab likhein…"))
          }
          busy={extracting}
          status={composerStatus}
          onAttach={stage === "done" ? undefined : () => fileInput.current?.click()}
          attachBusy={extracting}
          mic={voiceSupported ? { state: micState, onPress: pressMic } : null}
          keyboardInset={keyboardInset}
          onHeight={setComposerHeight}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => void uploadBiodata(e)}
      />
    </div>
  );
}

function failureCopy(failure: LiveFailure, t: (key: string, fallback: string) => string): string {
  switch (failure) {
    case "mic_denied":
      return t("bolo.fail.mic", "Mic ki permission nahi mili — likh kar ya biodata se banayein, ya browser me mic allow karein.");
    case "not_configured":
    case "disabled":
      return t("bolo.fail.off", "Voice abhi uplabdh nahi hai — likh kar ya biodata se banayein.");
    case "rate_limited":
      return t("bolo.fail.rate", "Abhi bahut koshishein ho gayi — thodi der baad phir try karein, ya likh kar banayein.");
    case "unsupported":
      return t("bolo.fail.unsupported", "Is browser me live voice nahi chalti — Chrome ya Safari me kholiye, ya likh kar banayein.");
    case "session_changed":
      return t("bolo.fail.sessionChanged", "Login badal gaya lagta hai — page refresh karke phir shuru kijiye.");
    default:
      return t("bolo.fail.generic", "Grio se connect nahi ho paya — phir try karein ya likh kar banayein.");
  }
}
