"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileUp,
  Heart,
  Keyboard,
  ListChecks,
  Loader2,
  LogOut,
  Mic,
  PhoneOff,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { PASSWORD_MIN_LENGTH, isAcceptablePassword } from "@/lib/auth/passwordPolicy";
import { boloMemberKickoff } from "@/lib/bolo/agent";
import {
  BOLO_DRAFT_KEY,
  MINIMUM_LIVE_KEYS,
  acceptAnswers,
  acceptPreferences,
  emptyDraft,
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
import type { BiodataResponse, FillingFor, InterviewResponse } from "@/lib/contracts/interview";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import { useT } from "@/components/i18n/LanguageProvider";
import GrioOrb from "@/components/bolo/GrioOrb";
import ProfileFillCard from "@/components/bolo/ProfileFillCard";
import ContactStep, { type OtpState } from "@/components/bolo/ContactStep";
import SetPasswordCard from "@/components/bolo/SetPasswordCard";

/**
 * `/bolo` — the spoken front door.
 *
 * One page, no long form. Grio (Gemini Live) asks the eight questions a live
 * profile needs; the card fills as the visitor answers; the card becomes the
 * review; then — and only then — a number, a code, and the account exists
 * around a profile that is already complete.
 *
 * ## Who owns what
 *
 *   - **The model** owns the conversation: what to ask next, in which words.
 *   - **This component** owns the draft. Every tool Grio calls runs here,
 *     against `draftRef`, and the model only ever learns what was accepted.
 *   - **The server** owns the truth: `/api/bolo/complete` re-validates every
 *     value and is the only thing that can say "live".
 *
 * Typing and a biodata upload reach the same draft through the same
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
 * "Fill Form Instead" is the typed deck, for someone who would rather tap.
 *
 * ## The order after the code is verified
 *
 * OTP → (optional) two preferences → `finish`, once → "Rishte dekhein?" →
 * `go_next`. The preferences are asked *before* `finish` so they ride in the
 * same request that creates the profile; `completeGuestProfile` accepts any
 * catalog field, so nothing new had to be built on the server for them. A
 * model that still asks for them after `finish` is not refused — by then the
 * visitor has a session, and the ordinary signed-in autosave persists the
 * two values the same way the deck would.
 *
 * Leaving the page is `go_next`'s job alone. `finish` used to arm a redirect
 * timer, which cut the preference question off mid-sentence; now the page
 * stays put — Grio's voice head and a Continue button both visible — until
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
type Line = { role: "user" | "grio"; text: string };
type Done = { landing: string; live: boolean; existingAccount: boolean; hasPassword: boolean };

interface Props {
  channels: { mobile: boolean; email: boolean };
  /** Gemini key present and the voice flag not OFF — the server's word, so a phone without a mic still sees the right first screen. */
  voiceAvailable: boolean;
  /** A signed-in member finishing an unfinished profile; null for a visitor. See "Signed in, not live yet". */
  member: BoloMember | null;
}

const WHO: Array<{ value: FillingFor; icon: typeof User; key: string; label: string }> = [
  { value: "self", icon: User, key: "bolo.who.self", label: "Apne liye" },
  { value: "son", icon: Users, key: "bolo.who.son", label: "Bete ke liye" },
  { value: "daughter", icon: Users, key: "bolo.who.daughter", label: "Beti ke liye" },
];

/** Where "Rishte dekhein — chalein?" goes once the profile is live. */
const REEL_PATH = "/user/reel";
/** The typed deck, for a member who would rather tap than talk. Closing it comes back here (`InterviewMode.leaveBuilder`). */
const MANUAL_DECK_PATH = "/profile/build?mode=manual";
/**
 * After `go_next`, how long Grio gets for her one-word goodbye before the page
 * leaves regardless. The page leaves earlier the moment the goodbye has been
 * heard and played out; this is only the ceiling.
 */
const GOODBYE_GRACE_MS = 3500;

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

  const [draft, setDraft] = useState<BoloDraft>(emptyDraft);
  const draftRef = useRef(draft);
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<Stage>("start");
  const stageRef = useRef(stage);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [level, setLevel] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [grioNow, setGrioNow] = useState("");
  const [userNow, setUserNow] = useState("");
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

  stageRef.current = stage;
  contactRef.current = contact;
  accountNameRef.current = accountName;
  otpRef.current = otp;
  accountPasswordRef.current = accountPassword;
  newPasswordRef.current = newPassword;
  passwordSavedRef.current = passwordSaved;

  /** Where this browser keeps the unfinished draft — a member's own key, or the one shared guest key. */
  const storageKey = member ? memberDraftKey(member.userId) : BOLO_DRAFT_KEY;
  const voiceSupported = useMemo(() => voiceAvailable && isLiveVoiceSupported(), [voiceAvailable]);
  const liveActive = liveStatus === "connecting" || liveStatus === "listening" || liveStatus === "speaking";
  const missing = useMemo(() => missingMinimum(draft.values), [draft.values]);
  const isComplete = missing.length === 0;
  const savedPreferences = useMemo(() => preferenceValues(draft.values), [draft.values]);

  /* ---------------------------- persistence --------------------------- */

  useEffect(() => {
    const stored = member ? memberStartDraft(member) : (readStoredDraft(BOLO_DRAFT_KEY) ?? emptyDraft());
    draftRef.current = stored;
    setDraft(stored);
    setHydrated(true);
    if (member) {
      // Everything already there: the review is the next step. Anything
      // missing: the member start screen, which says how much is left.
      if (missingMinimum(stored.values).length === 0) setStage("review");
    } else if (Object.keys(stored.values).length > 0) {
      setStage("review");
    }
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
    },
    [],
  );

  /* ------------------------------ draft ------------------------------- */

  const commitDraft = useCallback((next: BoloDraft) => {
    draftRef.current = next;
    setDraft(next);
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
      commitDraft({ ...draftRef.current, fillingFor: who, updatedAt: Date.now() });
    },
    [commitDraft],
  );

  const editField = useCallback(
    (key: string, value: string) => {
      const normalized = normalizeAnswer(key, value);
      const next: BoloDraft = {
        ...draftRef.current,
        values: { ...draftRef.current.values, [key]: normalized },
        confirmed: false,
        updatedAt: Date.now(),
      };
      if (!normalized) delete next.values[key];
      commitDraft(next);
      sessionRef.current?.sendText(`[User ne screen par ${key} badla: "${normalized || "(khaali)"}"]`);
    },
    [commitDraft],
  );

  /**
   * What the model should do once the contact step is behind it — or, for a
   * member (who has no contact step), once the review is confirmed.
   */
  const nextAfterContact = useCallback((): "preferences" | "finish" => {
    const values = draftRef.current.values;
    return missingMinimum(values).length === 0 && missingPreferences(values).length > 0 ? "preferences" : "finish";
  }, []);

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
          const { fillingFor, ...fields } = call.args;
          if (isFillingFor(fillingFor)) setWho(fillingFor);
          const result = applyAnswers(fields);
          if (stageRef.current === "start") setStage("talking");
          return {
            saved: result.saved,
            rejected: result.rejected.map((r) => ({ field: r.field, heard: r.heard, options: r.options })),
            missing: result.missing,
            fillingFor: draftRef.current.fillingFor,
          };
        }
        case "show_review": {
          const missingNow = missingMinimum(draftRef.current.values);
          setStage("review");
          haptic("tap");
          return { shown: true, values: draftRef.current.values, missing: missingNow };
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
          };
          if (finishedRef.current) {
            // Late — the profile already exists; persist through the signed-in autosave.
            const ok = result.saved.length === 0 || (await persistLatePreferences(result.saved));
            return { ...response, status: ok ? (result.saved.length > 0 ? "saved" : "nothing_saved") : "error", next: "go_next" };
          }
          return { ...response, status: result.saved.length > 0 ? "saved" : "nothing_saved", next: "finish" };
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
      persistLatePreferences,
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
            if (userBuf.current.trim()) {
              const said = userBuf.current.trim();
              userBuf.current = "";
              setUserNow("");
              setLines((l) => [...l.slice(-5), { role: "user", text: said }]);
            }
            grioBuf.current += event.text;
            setGrioNow(grioBuf.current);
            if (leavingRef.current) goodbyeHeardRef.current = true;
          }
          break;
        case "interrupted":
        case "turn_complete": {
          if (grioBuf.current.trim()) {
            const said = grioBuf.current.trim();
            grioBuf.current = "";
            setGrioNow("");
            setLines((l) => [...l.slice(-5), { role: "grio", text: said }]);
          }
          if (
            event.type === "turn_complete" &&
            leavingRef.current &&
            goodbyeHeardRef.current &&
            sessionRef.current?.currentStatus !== "speaking"
          ) {
            leaveNow();
          }
          break;
        }
        case "ended":
          sessionRef.current = null;
          if (leavingRef.current) {
            // Whatever ended the session, the visitor already said "chalein".
            leaveNow();
            break;
          }
          if (event.reason === "idle") setNotice(t("bolo.notice.idle", "Kaafi der se awaaz nahi aayi — baat-cheet rok di. Phir se shuru kar sakte hain."));
          else if (event.reason === "network" || event.reason === "go_away")
            setNotice(t("bolo.notice.dropped", "Connection toot gaya. Jo bhar gaya wo safe hai — phir se shuru karein ya type karein."));
          else if (event.reason === "max_session")
            setNotice(t("bolo.notice.maxSession", "Ek session ki seema aa gayi. Jo bhar gaya wo safe hai — phir se shuru karein."));
          if (stageRef.current === "talking" && Object.keys(draftRef.current.values).length === 0) setStage("start");
          break;
        case "failed":
          sessionRef.current = null;
          if (leavingRef.current) {
            leaveNow();
            break;
          }
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
    setLines([]);
    userBuf.current = "";
    grioBuf.current = "";
    const session = new GrioLiveSession(
      {
        onEvent: onLiveEvent,
        onToolCalls: async (calls) => {
          const out: Array<Record<string, unknown>> = [];
          for (const call of calls) out.push(await runTool(call));
          return out;
        },
      },
      member
        ? {
            mode: "member",
            // Built at the moment of starting, so answers typed or uploaded
            // before the mic was tapped count as already filled.
            kickoffText: boloMemberKickoff({
              firstName: member.firstName,
              fillingFor: draftRef.current.fillingFor,
              missing: missingMinimum(draftRef.current.values),
              needsReview: member.needsReview.filter((key) => Boolean(draftRef.current.values[key])),
            }),
          }
        : { mode: "guest" },
    );
    sessionRef.current = session;
    if (stageRef.current === "start") setStage("talking");
    haptic("tap");
    await session.start();
  }, [member, onLiveEvent, runTool]);

  const stopVoice = useCallback(() => {
    sessionRef.current?.stop("user");
    sessionRef.current = null;
    if (stageRef.current === "talking") setStage(Object.keys(draftRef.current.values).length > 0 ? "review" : "start");
  }, []);

  /* ------------------------------- typed ------------------------------ */

  const submitTyped = useCallback(async () => {
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    if (sessionRef.current && liveActive) {
      sessionRef.current.sendText(text);
      setLines((l) => [...l.slice(-5), { role: "user", text }]);
      return;
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
        }),
      });
      const body = (await res.json()) as InterviewResponse;
      if (!body.ok) {
        setNotice(body.message);
        return;
      }
      const incoming: Record<string, string> = {};
      for (const f of body.result.extractedFields) if (f.value) incoming[f.field] = f.value;
      const result = applyAnswers(incoming);
      if (result.saved.length === 0) {
        setNotice(t("bolo.notice.nothingFound", "Isme se koi profile detail samajh nahi aayi — naam, DOB, city jaise details likhiye."));
      } else if (result.missing.length === 0) {
        setStage("review");
      } else if (stageRef.current === "start") {
        setStage("talking");
      }
    } catch {
      setNotice(t("auth.error.network", "Network error — dobara try karein."));
    } finally {
      setExtracting(false);
    }
  }, [applyAnswers, liveActive, t, typed]);

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
        const result = applyAnswers(incoming);
        const count = result.saved.filter((k) => (MINIMUM_LIVE_KEYS as readonly string[]).includes(k)).length;
        setNotice(
          count > 0
            ? `${t("bolo.notice.biodataRead", "Biodata se")} ${count} ${t("bolo.notice.biodataFields", "details mil gayi — check kar lijiye.")}`
            : t("bolo.notice.biodataEmpty", "Biodata se zaroori details nahi mili — bol kar ya type karke bharein."),
        );
        if (result.missing.length === 0) setStage("review");
        else if (stageRef.current === "start") setStage("talking");
        sessionRef.current?.sendText(`[User ne biodata upload kiya; ye fields bhar gaye: ${result.saved.join(", ") || "koi nahi"}]`);
      } catch {
        setNotice(t("auth.error.network", "Network error — dobara try karein."));
      } finally {
        setExtracting(false);
      }
    },
    [applyAnswers, t],
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

  /* ------------------------------- render ----------------------------- */

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  const statusLine =
    liveStatus === "connecting"
      ? t("bolo.status.connecting", "Grio aa rahi hai…")
      : liveStatus === "speaking"
        ? t("bolo.status.speaking", "Grio bol rahi hai — beech me bol sakte hain")
        : liveStatus === "listening"
          ? t("bolo.status.listening", "Boliye, main sun rahi hoon")
          : null;

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
      : missing.length === 1
        ? `${memberGreeting} — ${t("bolo.member.leftOne", "bas 1 baat baaki hai")}`
        : `${memberGreeting} — ${t("bolo.member.leftPrefix", "bas")} ${missing.length} ${t("bolo.member.leftSuffix", "baatein baaki hain")}`;
  const hasAnswers = Object.keys(draft.values).length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* ------------------------------ hero ------------------------------ */}
      {stage === "start" && (
        <section className="bt-shell bt-shell--cream bt-shell--foil px-5 py-8 text-center sm:px-10 sm:py-10">
          <span className="bt-eyebrow mx-auto">
            <Sparkles className="size-4" />
            {t("bolo.hero.eyebrow", "Grio ke saath, 2 minute")}
          </span>
          <h1 className="bt-display mt-5 text-[2rem] leading-tight sm:text-[2.6rem]">
            {memberTitle ?? t("bolo.hero.title", "Bol kar profile banayein")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-muted">
            {member
              ? t("bolo.member.body", "Grio sirf bache hue sawaal poochegi — jo bhar chuka hai wo dobara nahi.")
              : t("bolo.hero.body", "Na lamba form. Grio 8 chhote sawaal poochegi, profile khud bharti jayegi — number sirf aakhir me.")}
          </p>

          <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3">
            {voiceSupported ? (
              <Button variant="accent" size="lg" fullWidth onClick={() => void startVoice()}>
                <Mic className="size-5" />
                {t("bolo.hero.start", "Start Talking")}
              </Button>
            ) : (
              <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
                {member
                  ? voiceAvailable
                    ? t("bolo.member.noMic", "Is browser me live voice nahi chalti — form se ya biodata se bhar lijiye.")
                    : t("bolo.member.voiceOff", "Voice abhi band hai — form se ya biodata se bhar lijiye.")
                  : voiceAvailable
                    ? t("bolo.hero.noMic", "Is browser me live voice nahi chalti — neeche likh kar ya biodata se banayein.")
                    : t("bolo.hero.voiceOff", "Voice abhi band hai — neeche likh kar ya biodata se banayein.")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {member ? (
                <Button variant="secondary" fullWidth onClick={() => router.push(MANUAL_DECK_PATH)}>
                  <ListChecks className="size-4" />
                  {t("bolo.member.fillForm", "Fill Form Instead")}
                </Button>
              ) : (
                <Button variant="secondary" fullWidth onClick={() => setStage("talking")}>
                  <Keyboard className="size-4" />
                  {t("bolo.hero.type", "Type Instead")}
                </Button>
              )}
              <Button variant="secondary" fullWidth loading={extracting} onClick={() => fileInput.current?.click()}>
                <FileUp className="size-4" />
                {t("bolo.hero.biodata", "Upload Biodata")}
              </Button>
            </div>
          </div>
          <p className="mt-5 text-xs text-muted">
            {t("bolo.hero.privacy", "Aapki baatein sirf profile bharne ke liye — kisi ko dikhengi nahi jab tak aap live na karein.")}
          </p>
        </section>
      )}

      {/* ---------------------------- voice head --------------------------- */}
      {/* Stays on the done screen too: the two-preference question and the
          goodbye happen there, and a head that vanished with `finish` left
          the visitor hearing a voice with nothing on screen to match it. */}
      {stage !== "start" && (stage !== "done" || liveActive) && (
        <section className="rounded-2xl border border-line bg-surface px-4 py-4 shadow-sm sm:px-6">
          <div className="flex items-center gap-4">
            {liveActive ? (
              <GrioOrb status={liveStatus} level={level} className="size-24 shrink-0 sm:size-28" />
            ) : (
              <button
                type="button"
                onClick={() => void startVoice()}
                disabled={!voiceSupported}
                className={cn(
                  "grid size-20 shrink-0 place-items-center rounded-full border border-gold-300/70 bg-gold-50 text-primary-text shadow-md transition-transform",
                  voiceSupported ? "hover:-translate-y-0.5 hover:shadow-gold" : "opacity-50",
                  "dark:bg-gold-900/30",
                )}
                aria-label={t("bolo.hero.start", "Start Talking")}
              >
                <Mic className="size-8" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-semibold text-ink">
                {leaving
                  ? t("bolo.status.leaving", "Chaliye — rishte khul rahe hain…")
                  : (statusLine ??
                    (voiceSupported
                      ? t("bolo.status.tapToTalk", "Mic dabaiye aur Grio se baat karein")
                      : t("bolo.status.typeOnly", "Neeche likh kar batayein")))}
              </p>
              <div className="mt-1 space-y-1 text-sm">
                {lines.slice(-2).map((line, i) => (
                  <p key={i} className={cn("truncate", line.role === "grio" ? "text-ink" : "text-muted italic")}>
                    {line.role === "grio" ? "Grio: " : "Aap: "}
                    {line.text}
                  </p>
                ))}
                {grioNow && <p className="text-ink">Grio: {grioNow}</p>}
                {userNow && <p className="italic text-muted">Aap: {userNow}</p>}
              </div>
            </div>
            {liveActive && !leaving && (
              <Button variant="ghost" size="icon-sm" onClick={stopVoice} aria-label={t("bolo.voice.stop", "Stop")}>
                <PhoneOff className="size-5" />
              </Button>
            )}
          </div>

          {draft.fillingFor === null && stage !== "done" && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {WHO.map(({ value, icon: Icon, key, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setWho(value);
                    sessionRef.current?.sendText(`[User ne screen par chuna: profile ${value === "self" ? "apne liye" : value === "son" ? "bete ke liye" : "beti ke liye"}]`);
                  }}
                  className="flex min-h-12 items-center justify-center gap-1.5 rounded-lg border border-line bg-bg-subtle px-2 text-xs font-medium text-ink hover:border-gold-500"
                >
                  <Icon className="size-4" />
                  {t(key, label)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {notice && (
        <p role="status" className="rounded-lg border border-gold-300/60 bg-gold-50/70 px-3 py-2 text-sm text-ink dark:bg-gold-900/20">
          {notice}
        </p>
      )}

      {/* ------------------------------ done ------------------------------ */}
      {stage === "done" && done && (
        <section className="mx-auto max-w-md space-y-5 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-trust-bg text-trust">
            <Sparkles className="size-8" />
          </span>
          <h1 className="bt-display text-3xl">
            {done.live ? t("bolo.done.liveTitle", "Profile live hai 🎉") : t("bolo.done.savedTitle", "Account ban gaya")}
          </h1>
          <p className="text-muted">
            {done.live
              ? t("bolo.done.liveBody", "Ab aapko rishte dikhne lagenge. Baaki details baad me bol kar bhar sakte hain.")
              : t("bolo.done.savedBody", "Profile draft save hai — bache hue sawaal andar poore kar lijiye.")}
          </p>
          {preferenceLines.length > 0 && (
            <ul className="mx-auto flex max-w-sm flex-wrap justify-center gap-2 text-xs">
              {preferenceLines.map((line) => (
                <li key={line.key} className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-subtle px-3 py-1 text-ink">
                  <Heart className="size-3 text-primary-text" />
                  <span className="text-muted">{line.label}:</span> {line.value}
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
          <Button
            variant="accent"
            size="lg"
            fullWidth
            loading={leaving}
            disabled={passwordBusy}
            onClick={() => void continueFromDone()}
          >
            {done.live ? t("bolo.done.seeMatches", "See Matches") : t("bolo.done.continue", "Continue")}
            <ArrowRight className="size-4" />
          </Button>
          {!done.hasPassword && !passwordSaved && (
            <p className="text-xs text-muted">{t("bolo.setPassword.later", "Abhi nahi? Baad me App Setup me bhi bana sakte hain.")}</p>
          )}
          {liveActive && !leaving && (
            <p className="text-xs text-muted">{t("bolo.done.grioStillHere", "Grio abhi bhi sun rahi hai — 2 pasand bata sakte hain, ya seedha aage badhein.")}</p>
          )}
        </section>
      )}

      {/* ------------------------------ card ------------------------------ */}
      {/* A member sees their card on the start screen too: how much is
          already there is the whole reason the page says "bas 3 baatein". */}
      {stage !== "done" && (stage !== "start" || (member !== null && hasAnswers)) && (
        <ProfileFillCard
          values={draft.values}
          fillingFor={draft.fillingFor}
          editable={stage !== "start" && (stage === "review" || stage === "contact" || !liveActive)}
          onChange={editField}
          highlight={highlight}
        />
      )}

      {/* ------------------------- review → contact ------------------------ */}
      {stage === "review" && (
        <div className="space-y-3">
          {member ? (
            <Button variant="accent" size="lg" fullWidth disabled={!isComplete} loading={busy} onClick={() => void memberGoLive()}>
              {t("bolo.review.goLive", "All Correct — Go Live")}
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button variant="accent" size="lg" fullWidth disabled={!isComplete} onClick={confirmReview}>
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
        </div>
      )}

      {stage === "contact" && !member && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-ink">
            {isComplete ? t("bolo.contact.title", "Bas ek number, aur profile live") : t("bolo.contact.titleDraft", "Number dijiye, draft save ho jayega")}
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            {t("bolo.contact.subtitle", "Isi se aap wapas login karenge.")}
          </p>
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
            <div className="mt-4 rounded-xl border border-line bg-bg-subtle px-3 py-2 text-xs text-ink">
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
            <Button className="mt-4" variant="accent" size="lg" fullWidth loading={busy} onClick={() => void uiFinish()}>
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

      {/* ------------------------------ typed ------------------------------ */}
      {stage !== "start" && stage !== "contact" && stage !== "done" && (
        <section className="space-y-2">
          <Textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            rows={2}
            placeholder={
              liveActive
                ? t("bolo.typed.placeholderLive", "Ya yahan likh dijiye — Grio padh legi")
                : t("bolo.typed.placeholder", "Likhiye: \"Rahul Sharma, 12 May 1995, Jaipur, B.Tech, software engineer…\"")
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitTyped();
              }
            }}
          />
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth loading={extracting} disabled={!typed.trim()} onClick={() => void submitTyped()}>
              {liveActive ? t("bolo.typed.send", "Send") : t("bolo.typed.extract", "Read & Fill")}
            </Button>
            <Button variant="ghost" loading={extracting} onClick={() => fileInput.current?.click()} aria-label={t("bolo.hero.biodata", "Upload Biodata")}>
              <FileUp className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {/* On the done screen the keyboard still reaches Grio — for the visitor
          who would rather type "25 se 29" than say it. */}
      {stage === "done" && liveActive && !leaving && (
        <section className="flex gap-2">
          <Textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            rows={1}
            placeholder={t("bolo.typed.placeholderLive", "Ya yahan likh dijiye — Grio padh legi")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitTyped();
              }
            }}
          />
          <Button variant="secondary" disabled={!typed.trim()} onClick={() => void submitTyped()}>
            {t("bolo.typed.send", "Send")}
          </Button>
        </section>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => void uploadBiodata(e)}
      />

      {stage !== "done" &&
        (member ? (
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted">
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
          </p>
        ) : (
          <p className="text-center text-xs text-muted">
            {t("bolo.footer.haveAccount", "Pehle se account hai?")}{" "}
            <Link href="/login" className="font-semibold text-primary-text underline-offset-4 hover:underline">
              {t("bolo.footer.login", "Login")}
            </Link>
          </p>
        ))}
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
