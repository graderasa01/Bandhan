"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileUp, Heart, Keyboard, Loader2, Mic, PhoneOff, Sparkles, User, Users } from "lucide-react";
import {
  BOLO_DRAFT_KEY,
  MINIMUM_LIVE_KEYS,
  acceptAnswers,
  acceptPreferences,
  emptyDraft,
  isFillingFor,
  labelsFor,
  missingMinimum,
  missingPreferences,
  normalizeAnswer,
  preferenceValues,
  type BoloDraft,
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

/**
 * `/bolo` — the spoken front door.
 *
 * One page, no account, no password. Grio (Gemini Live) asks the eight
 * questions a live profile needs; the card fills as the visitor answers; the
 * card becomes the review; then — and only then — a number, a code, and the
 * account exists around a profile that is already complete.
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
 */

type Stage = "start" | "talking" | "review" | "contact" | "done";
type Line = { role: "user" | "grio"; text: string };
type Done = { landing: string; live: boolean; existingAccount: boolean };

interface Props {
  channels: { mobile: boolean; email: boolean };
  /** Gemini key present and the voice flag not OFF — the server's word, so a phone without a mic still sees the right first screen. */
  voiceAvailable: boolean;
}

const WHO: Array<{ value: FillingFor; icon: typeof User; key: string; label: string }> = [
  { value: "self", icon: User, key: "bolo.who.self", label: "Apne liye" },
  { value: "son", icon: Users, key: "bolo.who.son", label: "Bete ke liye" },
  { value: "daughter", icon: Users, key: "bolo.who.daughter", label: "Beti ke liye" },
];

/** Where "Rishte dekhein — chalein?" goes once the profile is live. */
const REEL_PATH = "/user/reel";
/**
 * After `go_next`, how long Grio gets for her one-word goodbye before the page
 * leaves regardless. The page leaves earlier the moment the goodbye has been
 * heard and played out; this is only the ceiling.
 */
const GOODBYE_GRACE_MS = 3500;

function loadDraft(): BoloDraft {
  try {
    const raw = localStorage.getItem(BOLO_DRAFT_KEY);
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as Partial<BoloDraft>;
    if (parsed.version !== 1 || typeof parsed.values !== "object" || !parsed.values) return emptyDraft();
    return {
      version: 1,
      fillingFor: isFillingFor(parsed.fillingFor) ? parsed.fillingFor : null,
      values: parsed.values as BoloValues,
      confirmed: false,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return emptyDraft();
  }
}

export default function BoloExperience({ channels, voiceAvailable }: Props) {
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

  const sessionRef = useRef<GrioLiveSession | null>(null);
  const contactRef = useRef(contact);
  const accountNameRef = useRef(accountName);
  const proofRef = useRef<string | null>(null);
  const otpRef = useRef(otp);
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

  const voiceSupported = useMemo(() => voiceAvailable && isLiveVoiceSupported(), [voiceAvailable]);
  const liveActive = liveStatus === "connecting" || liveStatus === "listening" || liveStatus === "speaking";
  const missing = useMemo(() => missingMinimum(draft.values), [draft.values]);
  const isComplete = missing.length === 0;
  const savedPreferences = useMemo(() => preferenceValues(draft.values), [draft.values]);

  /* ---------------------------- persistence --------------------------- */

  useEffect(() => {
    const stored = loadDraft();
    draftRef.current = stored;
    setDraft(stored);
    setHydrated(true);
    if (Object.keys(stored.values).length > 0) setStage("review");
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(BOLO_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode — the draft simply lives in memory */
    }
  }, [draft, hydrated]);

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

  /** What the model should do once the contact step is behind it. */
  const nextAfterContact = useCallback((): "preferences" | "finish" => {
    const values = draftRef.current.values;
    return missingMinimum(values).length === 0 && missingPreferences(values).length > 0 ? "preferences" : "finish";
  }, []);

  /* ------------------------------ leaving ----------------------------- */

  /** Where Continue / `go_next` goes: the reel for a live profile, the builder for a saved draft. */
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
   * The account, the profile and the session, in one request. Idempotent:
   * once it has succeeded, every later call answers with the same result and
   * touches nothing — a model that calls `finish` twice creates one account.
   * Never navigates; that is `go_next` / Continue.
   */
  const completeAccount = useCallback(async () => {
    if (finishedRef.current) {
      const previous = doneRef.current;
      return previous?.live
        ? { status: "live" as const, alreadyFinished: true }
        : { status: "saved" as const, alreadyFinished: true, missing: labelsFor(missingMinimum(draftRef.current.values)) };
    }
    const current = draftRef.current;
    if (!contactRef.current.trim()) return { status: "needs_contact" as const };
    setBusy(true);
    try {
      const res = await fetch("/api/bolo/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fillingFor: current.fillingFor ?? "self",
          // The eight fields and, when the visitor gave them, the two
          // preferences — one payload, one `acceptAnswers`, one `saveDraft`.
          values: current.values,
          contact: contactRef.current,
          accountName: accountNameRef.current || undefined,
          proof: proofRef.current ?? undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        live?: boolean;
        landing?: string;
        existingAccount?: boolean;
        error?: string;
        message?: string;
        missing?: string[];
      };
      if (body.ok && body.landing) {
        const result: Done = { landing: body.landing, live: Boolean(body.live), existingAccount: Boolean(body.existingAccount) };
        finishedRef.current = true;
        doneRef.current = result;
        try {
          localStorage.removeItem(BOLO_DRAFT_KEY);
        } catch {
          /* nothing to clear */
        }
        setDone(result);
        setStage("done");
        haptic("success");
        return body.live ? { status: "live" as const } : { status: "saved" as const, missing: labelsFor(body.missing ?? []) };
      }
      if (body.error === "ALREADY_SIGNED_IN") {
        router.replace("/profile/build");
        return { status: "error" as const, message: body.message ?? "" };
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
  }, [router, t]);

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
          const alreadyConfirmed = draftRef.current.confirmed && stageRef.current === "contact";
          if (!draftRef.current.confirmed) commitDraft({ ...draftRef.current, confirmed: true, updatedAt: Date.now() });
          if (stageRef.current !== "contact") {
            setStage("contact");
            haptic("tap");
          }
          return { status: "confirmed", alreadyConfirmed, next: "contact" };
        }
        case "request_otp": {
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
          if (result.status === "skipped") return { ...result, next: nextAfterContact() };
          return result;
        }
        case "verify_otp": {
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
          if (finishedRef.current) return { ...(await completeAccount()), next: "go_next" };
          setStage("contact");
          const missingNow = missingMinimum(draftRef.current.values);
          if (!contactRef.current.trim()) {
            return { status: "needs_contact", missing: labelsFor(missingNow) };
          }
          const result = await completeAccount();
          if (result.status === "live" || result.status === "saved") {
            return { ...result, preferencesSaved: Object.keys(preferenceValues(draftRef.current.values)), next: "go_next" };
          }
          return result;
        }
        case "go_next": {
          if (!finishedRef.current) return { status: "not_finished", hint: "Pehle finish call karo." };
          if (leavingRef.current) return { status: "already_leaving" };
          beginLeaving();
          return { status: "leaving", target: nextTarget(), hint: "Ek shabd me alvida bolo, phir kuch mat bolo." };
        }
        default:
          return { status: "unknown_tool" };
      }
    },
    [applyAnswers, applyPreferences, beginLeaving, commitDraft, completeAccount, nextAfterContact, nextTarget, persistLatePreferences, sendOtp, setWho, verifyOtp],
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
    const session = new GrioLiveSession({
      onEvent: onLiveEvent,
      onToolCalls: async (calls) => {
        const out: Array<Record<string, unknown>> = [];
        for (const call of calls) out.push(await runTool(call));
        return out;
      },
    });
    sessionRef.current = session;
    if (stageRef.current === "start") setStage("talking");
    haptic("tap");
    await session.start();
  }, [onLiveEvent, runTool]);

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
      sessionRef.current?.sendText("[User ne button se profile bana li — ek line me badhai do, phir EK baar poochho 'Rishte dekhein — chalein?'; haan par go_next]");
    }
  }, [completeAccount]);

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
            {t("bolo.hero.title", "Bol kar profile banayein")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-muted">
            {t("bolo.hero.body", "Na form, na password. Grio 8 chhote sawaal poochegi, profile khud bharti jayegi — number sirf aakhir me.")}
          </p>

          <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3">
            {voiceSupported ? (
              <Button variant="accent" size="lg" fullWidth onClick={() => void startVoice()}>
                <Mic className="size-5" />
                {t("bolo.hero.start", "Start Talking")}
              </Button>
            ) : (
              <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
                {voiceAvailable
                  ? t("bolo.hero.noMic", "Is browser me live voice nahi chalti — neeche likh kar ya biodata se banayein.")
                  : t("bolo.hero.voiceOff", "Voice abhi band hai — neeche likh kar ya biodata se banayein.")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" fullWidth onClick={() => setStage("talking")}>
                <Keyboard className="size-4" />
                {t("bolo.hero.type", "Type Instead")}
              </Button>
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
          <p className="text-xs text-muted">
            {t("bolo.done.passwordNote", "Password ki zaroorat nahi — ye phone yaad rakhega. Chahein to App Setup me password bhi rakh sakte hain.")}
          </p>
          <Button variant="accent" size="lg" fullWidth loading={leaving} onClick={beginLeaving}>
            {done.live ? t("bolo.done.seeMatches", "See Matches") : t("bolo.done.continue", "Continue")}
            <ArrowRight className="size-4" />
          </Button>
          {liveActive && !leaving && (
            <p className="text-xs text-muted">{t("bolo.done.grioStillHere", "Grio abhi bhi sun rahi hai — 2 pasand bata sakte hain, ya seedha aage badhein.")}</p>
          )}
        </section>
      )}

      {/* ------------------------------ card ------------------------------ */}
      {stage !== "start" && stage !== "done" && (
        <ProfileFillCard
          values={draft.values}
          fillingFor={draft.fillingFor}
          editable={stage === "review" || stage === "contact" || !liveActive}
          onChange={editField}
          highlight={highlight}
        />
      )}

      {/* ------------------------- review → contact ------------------------ */}
      {stage === "review" && (
        <div className="space-y-3">
          <Button variant="accent" size="lg" fullWidth disabled={!isComplete} onClick={confirmReview}>
            {t("bolo.review.confirm", "All Correct — Continue")}
            <ArrowRight className="size-4" />
          </Button>
          {!isComplete && (
            <p className="text-center text-xs text-muted">
              {t("bolo.review.missing", "Abhi baaki:")} {labelsFor(missing).join(", ")}
            </p>
          )}
          {!isComplete && (
            <Button variant="link" fullWidth onClick={() => setStage("contact")}>
              {t("bolo.review.saveDraft", "Save Draft & Create Account")}
            </Button>
          )}
        </div>
      )}

      {stage === "contact" && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-ink">
            {isComplete ? t("bolo.contact.title", "Bas ek number, aur profile live") : t("bolo.contact.titleDraft", "Number dijiye, draft save ho jayega")}
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            {t("bolo.contact.subtitle", "Isi se aap wapas login karenge. Password nahi chahiye.")}
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

      {stage !== "done" && (
        <p className="text-center text-xs text-muted">
          {t("bolo.footer.haveAccount", "Pehle se account hai?")}{" "}
          <Link href="/login" className="font-semibold text-primary-text underline-offset-4 hover:underline">
            {t("bolo.footer.login", "Login")}
          </Link>
        </p>
      )}
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
    default:
      return t("bolo.fail.generic", "Grio se connect nahi ho paya — phir try karein ya likh kar banayein.");
  }
}
