"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  FileUp,
  ListChecks,
  Loader2,
  Mic,
  Flame,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import {
  HI_ACTIONS,
  type ActionLabels,
  type AskResponse,
  type BiodataResponse,
  type FillingFor,
  type InterviewResponse,
  type SpokenLanguage,
} from "@/lib/contracts/interview";
import { batchQuestionFor, questionFor, type ProfileFieldDef } from "@/lib/profile/fields";
import { GATE_DECK_KEYS, queue } from "@/lib/profile/stages";
import { MINIMUM_LIVE_FIELDS, MINIMUM_LIVE_KEYS } from "@/lib/profile/readiness";
import {
  FIELD_CATEGORY_BY_KEY,
  fieldsInCategory,
  isFieldCategoryKey,
  type FieldCategoryKey,
} from "@/lib/profile/fieldGroups";
import { isMindsetAnswered } from "@/lib/profile/mindset";
import { detectLocalGuesses, type LocalGuess } from "@/lib/profile/localDetect";
import { VOICE_REASON_MAX, VOICE_REASON_MIN } from "@/lib/profile/voiceAccessConstants";
import { useProfile } from "@/lib/profile/profileState";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import InfoTip from "@/components/ui/InfoTip";
import Sheet from "@/components/ui/Sheet";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import Celebrate from "@/components/ui/Celebrate";
import { ChoiceCard } from "@/components/ui/Controls";
import MagicSetupCard from "@/components/profile/MagicSetupCard";
import LanguagePicker, { LanguageSwitchOffer } from "@/components/profile/LanguagePicker";
import BioWriter from "@/components/profile/BioWriter";
import FieldEditSheet from "@/components/profile/FieldEditSheet";
import MindsetFlow from "@/components/profile/MindsetFlow";
import ManualProfileFormMobile from "@/components/profile/ManualProfileFormMobile";
import SmartProfileDeck from "@/components/profile/SmartProfileDeck";
import TargetedVoiceCard, { type BatchQuestionItem } from "@/components/profile/TargetedVoiceCard";
import ProfileReviewPanel from "@/components/profile/ProfileReviewPanel";
import VoiceStopCard from "@/components/profile/VoiceStopCard";
import { DraftTrayMobile } from "@/components/profile/DraftTray";
import { useT } from "@/components/i18n/LanguageProvider";
import { catalogKey } from "@/lib/i18n/catalogKeys";

/* ------------------------------------------------------------------ */

/**
 * A local mirror of `MAX_SESSION_TURNS`, used only until the availability
 * request lands. The server's number wins the moment it arrives — this is a
 * first-paint default, not a second source of truth.
 */
const MAX_VOICE_SESSION_TURNS = 14;

/** What `/api/profile/voice-availability` answers. See voiceOnboardingService. */
type VoiceAvailability = {
  available: boolean;
  reason: "disabled" | "not_configured" | "daily_limit" | null;
  serverSpeech: boolean;
  turnsLeftToday: number;
  maxSessionTurns: number;
};

/**
 * The whole first-time journey, in order.
 *
 *   who → method → (voice | upload | manual) → review → live
 *
 * `review` is new and is where all three methods meet: whatever produced the
 * answers, the user sees them once, fixes what is wrong, and only then goes
 * live. It replaces the old `harvest` screen, which followed an upload, listed
 * what had been read, and then dropped the user into another long interview
 * with no way to correct a single one of those values on the way past.
 */
type Phase = "who" | "method" | "upload" | "review" | "targeted" | "mindset" | "manual" | "live";

const WHO_ICON: Record<"self" | "son" | "daughter", typeof User> = {
  self: User,
  son: Users,
  daughter: Users,
};

/**
 * Both sources — a spoken turn and an uploaded biodata — produce the same two
 * buckets, so they merge into the draft the same way. Keeping this in one place
 * is what stops upload from quietly growing its own rules about what counts as
 * confirmed.
 */
function toEntries(
  extracted: { field: string; value: string | null; confidence: number; sourceSpan: string | null; needsConfirmation: boolean }[],
  inferred: { field: string; value: string; confidence: number; inferredFrom: string }[],
) {
  return [
    ...extracted
      .filter((f) => f.value !== null)
      .map((f) => ({
        key: f.field,
        value: f.value as string,
        meta: {
          source: "ai" as const,
          confidence: f.confidence,
          sourceSpan: f.sourceSpan ?? undefined,
          confirmed: !f.needsConfirmation,
        },
      })),
    ...inferred.map((f) => ({
      key: f.field,
      value: f.value,
      meta: {
        source: "inferred" as const,
        confidence: f.confidence,
        inferredFrom: f.inferredFrom,
        confirmed: false,
      },
    })),
  ];
}

/* ------------------------------------------------------------------ */
/* Biodata drop zone                                                   */
/* ------------------------------------------------------------------ */

/**
 * What the upload is actually doing, right now.
 *
 * `uploading` is the only phase with a number, and that number is real —
 * XHR's own `upload.progress` events. The card this replaces ran a fake
 * five-step timer to 100% and *then* started working, so the bar finished
 * before the request did and the honest part of the wait (a model reading a
 * scanned page, which is the slow bit) happened behind a full progress bar.
 */
export type UploadStage =
  | { phase: "uploading"; percent: number }
  | { phase: "reading" }
  | { phase: "preparing" };

function BiodataDropZone({
  stage,
  onFile,
}: {
  stage: UploadStage | null;
  onFile: (file: File) => void;
}) {
  const t = useT();
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState<string | null>(null);

  function take(file: File | undefined) {
    if (!file || stage) return;
    haptic("tap");
    setName(file.name);
    onFile(file);
  }

  if (stage) {
    const label =
      stage.phase === "uploading"
        ? t("profile.interviewMode.upload.stageUploading", "Bheja ja raha hai…")
        : stage.phase === "reading"
          ? t("profile.interviewMode.upload.stageReading", "Biodata padha ja raha hai…")
          : t("profile.interviewMode.upload.stagePreparing", "Review taiyaar ho raha hai…");

    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-bg-subtle px-6 py-12 text-center">
        {stage.phase === "uploading" ? (
          <div
            className="h-1.5 w-40 overflow-hidden rounded-full bg-surface"
            role="progressbar"
            aria-valuenow={stage.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-trust transition-[width] duration-200"
              style={{ width: `${stage.percent}%` }}
            />
          </div>
        ) : (
          <Loader2 className="size-7 animate-spin text-primary-text" />
        )}
        <p className="text-[0.9375rem] font-semibold text-ink">{label}</p>
        {name && <p className="max-w-xs truncate text-[0.8125rem] text-muted">{name}</p>}
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center",
        "transition-colors duration-200",
        dragging
          ? "border-primary bg-gold-50 dark:bg-gold-900/30"
          : "border-line-strong bg-bg-subtle hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/20",
      )}
    >
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => take(e.target.files?.[0])}
      />
      <span className="grid size-14 place-items-center rounded-full bg-surface text-primary-text shadow-sm">
        <FileUp className="size-6" />
      </span>
      <span className="text-[0.9375rem] font-semibold text-ink">
        {t("profile.interviewMode.upload.dropZoneLabel", "Yahan daal dijiye, ya tap karke chunein")}
      </span>
      <span className="text-[0.8125rem] text-muted">
        {t("profile.interviewMode.upload.dropZoneHint", "PDF ya photo · 10 MB tak")}
      </span>
    </label>
  );
}


/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function InterviewMode() {
  const {
    draft,
    ready,
    setValues,
    skipField,
    setFillingFor,
    setLanguage,
    live,
    readiness,
    flushSave,
    voiceSelfFillStatus,
    setVoiceSelfFillStatus,
  } = useProfile();
  const t = useT();
  const reduced = useReducedMotion();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("who");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landed, setLanded] = useState<string[]>([]);
  /** Tier-0, client-side guesses from the interim transcript — see localDetect.ts. Never saved. */
  const [localGuesses, setLocalGuesses] = useState<Partial<Record<string, LocalGuess>>>({});
  const [misses, setMisses] = useState<Record<string, number>>({});
  /**
   * How many fields get asked together in one voice turn.
   *
   * Three by default, and no longer a question. A whole screen used to open
   * the spoken flow by asking how the user would like to be asked — before a
   * single profile question had been put to them — and the answer it was
   * fishing for is the one the product wants anyway: two or three related
   * fields in one natural sentence. The slower mode is still there, as a
   * toggle on the question card itself (see `onBatchSizeChange`), which is
   * where somebody discovers they want it.
   */
  const [batchSize, setBatchSize] = useState<1 | 3>(3);
  /**
   * Fast pace, 2026-08-05: the fixed running order for the *first* pass
   * through the current stage, snapshotted once when voice mode starts and
   * never recomputed from `draft.values` while it's still running. That's
   * what lets the next batch get asked the instant this one is answered,
   * without waiting for the AI to finish understanding it first — a
   * dynamic "what's still unanswered" pick would itself have to wait on
   * that same extraction. `null` until the plan exists; once every field in
   * it has been *asked* (not necessarily understood yet), `currentBatch`
   * falls back to the ordinary live/dynamic pick below — which is also
   * where the required-first ordering already comes from, so nothing
   * mandatory can fall through the gap between the two modes.
   */
  const [plannedQueue, setPlannedQueue] = useState<ProfileFieldDef[] | null>(null);
  const [plannedIndex, setPlannedIndex] = useState(0);
  /** Synchronous mirror of `plannedIndex` — `submit` advances the plan the
   *  instant a turn is handed off, before React has re-rendered, so the
   *  very next batch can't be computed off a stale index. */
  const plannedIndexRef = useRef(0);
  /** A natural follow-up question from the AI when one of the asked fields
   *  came back unresolved — scoped to the fields it's about (`turnKeys`), so
   *  it self-clears the moment the batch moves past all of them. */
  const [clarification, setClarification] = useState<{ turnKeys: string[]; text: string } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  /** Biodata headings we saw but have no field for — shown, never dropped. */
  const [ignored, setIgnored] = useState<string[]>([]);
  /** Honest upload phase — see `UploadStage`. Null when nothing is in flight. */
  const [uploadStage, setUploadStage] = useState<UploadStage | null>(null);
  /** A detected language that disagrees with the chosen one — offered, not applied. */
  const [langOffer, setLangOffer] = useState<SpokenLanguage | null>(null);
  const [langOfferRefused, setLangOfferRefused] = useState<SpokenLanguage[]>([]);
  /** Field whose bio writer is open, or null. */
  const [bioKey, setBioKey] = useState<string | null>(null);
  /** Captured value being corrected, or null. */
  const [editKey, setEditKey] = useState<string | null>(null);
  /** Where "Peeche" goes from the upload screen — it has two entry points now. */
  const [cameFrom, setCameFrom] = useState<Phase>("method");
  /** `?field=` on a `?mode=manual` link — jump straight to that one row instead
   *  of landing on the form and leaving the user to scroll for it themselves. */
  const [manualFocusKey, setManualFocusKey] = useState<string | null>(null);
  /**
   * How the manual deck was entered, which decides how much of the catalog it
   * shows. Three shapes, all set from the URL by the effect below:
   *
   *   `cat`        — restrict to one category ("Partner ki ummeed")
   *   `all=1`      — include already-answered fields, for editing one
   *   neither      — the whole catalog, unfiltered (first-run onboarding)
   *
   * Held as state rather than read inline because `window.location` is not
   * available during the server render, and re-reading it on every render
   * would make the deck's own frozen page list disagree with it.
   */
  const [manualCategory, setManualCategory] = useState<FieldCategoryKey | null>(null);
  const [manualIncludeFilled, setManualIncludeFilled] = useState(false);
  /**
   * The deck is the *gate* deck — eight required fields plus the optional
   * photo (`GATE_DECK_KEYS`), not the whole catalog.
   *
   * True for anyone whose profile isn't live yet, because for them the
   * catalog is noise: past the eighth field, not one more card moves them any
   * closer to being visible, and a new account picking "Khud Bharein" was
   * being handed all sixty (2026-08-25). Once live, every manual entry point
   * ("Add More Details", "Full Profile Form", a category chip) is a top-up
   * and gets the full catalog exactly as before.
   *
   * Snapshotted when the deck opens rather than derived on each render: the
   * eighth answer flips `live` mid-deck, and a live `!live` would swap the
   * ending card out from under the user at that moment.
   */
  const [manualGate, setManualGate] = useState(false);
  /**
   * Where the X button goes. A deck opened from the dashboard's field list has
   * to return *there* — the entire point of picking one chip is coming back for
   * the next one, and dropping the user on the onboarding "method" screen
   * instead ends the loop after a single field.
   */
  const [manualReturnTo, setManualReturnTo] = useState<string | null>(null);
  /**
   * Which manual deck to show. False (the tap deck) on every entry — the long
   * form is a choice made inside the deck, not a mode you can arrive in, so
   * it resets with the phase rather than persisting.
   */
  const [manualLongForm, setManualLongForm] = useState(false);
  /** The "apne liye bolna hai, reason batayein" sheet — kept as the way to ask
   *  an admin when voice is switched off, see `voiceAvailability` below. */
  const [voiceRequestOpen, setVoiceRequestOpen] = useState(false);
  const [voiceReason, setVoiceReason] = useState("");
  const [voiceRequestBusy, setVoiceRequestBusy] = useState(false);
  /**
   * An explicit field list for the manual deck, set when the review screen
   * sends the user to close specific gaps. Null means "use the deck's own
   * scoping rules" (category / gate deck / whole catalog).
   */
  const [manualOnlyKeys, setManualOnlyKeys] = useState<string[] | null>(null);
  /**
   * Whether the spoken interview is still working through the minimum eight or
   * has been asked to carry on past them.
   *
   * The whole point of §2: voice asks for the minimum and *stops*. It used to
   * roll straight on through stage 2, stage 3 and the rest of the sixty-field
   * catalog, so "profile ready" arrived somewhere in the middle of an
   * open-ended interview nobody had agreed to.
   */
  const [voiceScope, setVoiceScope] = useState<"minimum" | "more">("minimum");
  /** Spoken turns this sitting — the session cap, see MAX_SESSION_TURNS. */
  const [turnsThisSession, setTurnsThisSession] = useState(0);
  /** Server's answer to "may this user speak right now", fetched once. */
  const [voiceAvailability, setVoiceAvailability] = useState<VoiceAvailability | null>(null);
  /** Set when the interview endpoint refuses on cost grounds — offer typing. */
  const [voiceBlocked, setVoiceBlocked] = useState(false);

  const router = useRouter();

  const openUpload = useCallback((from: Phase) => {
    haptic("tap");
    setCameFrom(from);
    setPhase("upload");
  }, []);

  /**
   * Every in-app way into the manual deck, so the two that differ actually say
   * how. "Add More Details" means the gaps; "Full Profile Form" means all of
   * it — before this they were the same button with two labels.
   */
  const openManual = useCallback(
    (opts: { includeFilled: boolean; scope?: "missing" }) => {
      haptic("tap");
      setManualCategory(null);
      setManualFocusKey(null);
      setManualIncludeFilled(opts.includeFilled);
      // "missing" carries its own explicit key list (`manualOnlyKeys`), so it
      // must not also be scoped to the gate deck — the two would intersect and
      // silently drop any non-minimum field the review screen asked for.
      setManualGate(opts.scope !== "missing" && !live);
      if (opts.scope !== "missing") setManualOnlyKeys(null);
      setManualLongForm(false);
      setPhase("manual");
    },
    [live],
  );
  const wasLive = useRef(false);

  /**
   * "Abhi ke liye save karein" — stop wherever you are, keep everything.
   *
   * Waits for a real save rather than trusting the 900ms autosave debounce to
   * have fired: a user who taps this and closes the tab must not lose the last
   * two answers. Where it lands is decided by the server's own reply, not by
   * hope — `live` only if the server says the profile is actually live, the
   * review screen otherwise, which is honest about a draft being a draft.
   */
  const saveAndExit = useCallback(async () => {
    haptic("tap");
    const result = await flushSave();
    setPhase(result.ok && result.live ? "live" : "review");
  }, [flushSave]);

  const language = draft.language;

  // Resume mid-draft rather than starting the interview over. A `?mode=manual`
  // link (dashboard, profile gate) skips straight past that resume logic —
  // someone who tapped "form bhariye" wants the form, not wherever the voice
  // flow last left off.
  useEffect(() => {
    if (!ready) return;
    // Seed *before* the "just went live" effect below runs its own check on
    // this same `live` change. Without this, reloading (or freshly navigating
    // to) an already-live profile looks identical to going live for the first
    // time — `wasLive` starts at `false` on every mount — and that effect
    // fires the mindset flow / celebration again, stomping over whatever
    // phase this effect just picked (including a `?mode=manual` deep link).
    wasLive.current = live;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "manual") {
      setManualFocusKey(params.get("field"));
      const cat = params.get("cat");
      if (isFieldCategoryKey(cat)) setManualCategory(cat);
      setManualIncludeFilled(params.get("all") === "1");
      // Same rule as `openManual`: a not-yet-live profile gets the gate deck.
      // `cat` is the one exception — that link names a section on purpose, so
      // it keeps its own scope even before the profile is live.
      setManualGate(!live && !isFieldCategoryKey(cat));
      // Same-origin paths only. `return` arrives in a URL, so it is untrusted
      // input; without this an emailed link could bounce the X button to an
      // external site that looks like the app's own next screen.
      const back = params.get("return");
      if (back && back.startsWith("/") && !back.startsWith("//")) setManualReturnTo(back);
      setManualLongForm(false);
      setPhase("manual");
      return;
    }
    if (live) setPhase("live");
    // Resuming with answers already in the draft lands on `review`, not back
    // in the middle of a spoken interview. It is the one screen that says what
    // is there, what is missing, and what to do about either — which is what
    // somebody returning to a half-built profile is actually asking.
    else if (Object.keys(draft.values).length > 0) setPhase("review");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (live && !wasLive.current) {
      // The manual deck owns the whole screen while it is open, and the
      // answer that flips `live` is one typed into a card inside it — tearing
      // the deck down at that instant would swallow the cards it still has to
      // show (the optional photo, its own "you're live" ending) and drop the
      // user somewhere else mid-swipe. So the handoff waits: `wasLive` is
      // deliberately left `false`, and `phase` is in the dep list, so closing
      // the deck re-runs this effect and the celebration lands then instead.
      // Three phases own their own ending and must not be yanked out of it.
      //
      // `manual` is mid-swipe. `review` is where the user is deciding what to
      // do next. `targeted` is the spoken interview, whose whole §2 contract is
      // that reaching the minimum stops the questions and *asks* — the autosave
      // activating the profile a beat earlier must not answer that question on
      // the user's behalf by jumping to the celebration.
      if (phase === "manual" || phase === "review" || phase === "targeted") return;
      wasLive.current = true;
      haptic("success");
      // Straight to the live screen, and its one question: more now, or in?
      //
      // The mindset trio used to be forced in here, between going live and
      // that choice — three more questions nobody had agreed to, at the exact
      // moment the product had just said "you're done". It is still one tap
      // away (the live screen offers it, and `/user/vibe` asks the same
      // questions on the days a user wants them); it is simply no longer a
      // toll gate on the way out of onboarding.
      setCelebrate(true);
      setPhase("live");
    }
  }, [live, phase]);

  /**
   * What the spoken interview is allowed to ask about right now.
   *
   * In `minimum` scope — the default, and where every first-time session
   * starts — that is **only** the eight fields that make a profile live, and
   * only the ones still open. It used to be the whole remaining catalog in
   * stage order, so a user who agreed to "bol kar bata dijiye" was signed up
   * for sixty questions and passed the finish line somewhere in the middle
   * without being told.
   *
   * `more` is what the user gets after explicitly choosing "2-3 details aur
   * bharein" on the ready card — three more questions, not another open run.
   */
  const voiceQueue = useMemo(() => {
    const open = queue(draft.values, draft.skipped);
    if (voiceScope === "minimum") {
      const blocking = new Set(readiness.blockers.map((b) => b.key));
      return open.filter((f) => blocking.has(f.key));
    }
    return open.filter((f) => !MINIMUM_LIVE_KEYS.includes(f.key)).slice(0, 3);
    // `readiness` is derived from `draft.values`, already in the deps.
  }, [draft.values, draft.skipped, voiceScope, readiness.blockers]);

  // Snapshot the fast-pace running order once, as soon as voice mode is
  // actually about to ask something (batchSize decided). Scoped to whatever
  // `voiceQueue` currently allows, so the plan can never fast-fire past the
  // minimum into the rest of the catalog.
  useEffect(() => {
    if (phase !== "targeted" || plannedQueue !== null) return;
    setPlannedQueue(voiceQueue);
    setPlannedIndex(0);
    plannedIndexRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, batchSize, plannedQueue]);

  const forSelf = draft.fillingFor === "self";
  /** Answered or explicitly skipped — either way, stop offering it. */
  const mindsetDone = isMindsetAnswered(draft.values) || draft.skipped.includes("mindsetFlow");
  const currentBatch: ProfileFieldDef[] = useMemo(() => {
    if (phase !== "targeted") return [];
    // The minimum is met — voice stops here and the ready card takes over. No
    // "one more thing" while the user is not looking.
    if (voiceScope === "minimum" && readiness.ready) return [];
    // Still inside the fast-planned pass — slice off the fixed order rather
    // than asking the gap engine, which would need `draft.values` to already
    // reflect turns whose extraction hasn't landed yet. Intersected with the
    // live queue so a field answered out of order (the rail lets a user answer
    // anything they can see) is never asked again — §2's "never ask again for
    // a value already answered and valid".
    if (plannedQueue && plannedIndex < plannedQueue.length) {
      const stillOpen = new Set(voiceQueue.map((f) => f.key));
      const planned = plannedQueue
        .slice(plannedIndex, plannedIndex + batchSize)
        .filter((f) => stillOpen.has(f.key));
      if (planned.length > 0) return planned;
    }
    // Plan exhausted, or every field in this slice already answered — back to
    // the live pick. This is also the mop-up round: anything the plan asked
    // about but didn't land reappears here, since it's still unanswered.
    return voiceQueue.slice(0, batchSize);
  }, [phase, batchSize, plannedQueue, plannedIndex, voiceQueue, voiceScope, readiness.ready]);
  const currentField: ProfileFieldDef | null = currentBatch[0] ?? null;

  /** Read from inside the memoised turn handler, which must not close over a stale scope. */
  const voiceScopeRef = useRef(voiceScope);
  voiceScopeRef.current = voiceScope;

  /** True the moment the eight minimum fields are done and vouched for. */
  const voiceReachedMinimum = phase === "targeted" && voiceScope === "minimum" && readiness.ready;
  /** One sitting's turn budget is spent — see MAX_SESSION_TURNS. */
  const sessionCapReached =
    turnsThisSession >= (voiceAvailability?.maxSessionTurns ?? MAX_VOICE_SESSION_TURNS);

  /**
   * The chips above the question — what this round is about, and nothing else.
   *
   * While the minimum is being asked that is the eight fields that make a
   * profile live. In the "2-3 aur" round it is those two or three, full stop:
   * it used to render the whole of stage 2, so a round the user was promised
   * would be three questions long opened with a rail of twenty-one and a
   * counter reading "0 / 21".
   */
  const railFields = useMemo(
    () => (voiceScope === "minimum" ? MINIMUM_LIVE_FIELDS : voiceQueue),
    [voiceScope, voiceQueue],
  );

  /**
   * Translated questions, keyed by field. Held client-side as well as on the
   * server so a field asked twice never waits again.
   */
  const [asked, setAsked] = useState<
    Record<string, { question: string; optionLabels?: Record<string, string> }>
  >({});
  /** Language-wide, not per field — same two controls on every question. */
  const [actions, setActions] = useState<ActionLabels>(HI_ACTIONS);
  /** Fields whose translation is in flight or failed — drives the placeholder. */
  const [translating, setTranslating] = useState<string[]>([]);
  const askedRef = useRef(asked);
  askedRef.current = asked;

  const fetchAsked = useCallback(
    async (fieldKey: string, lang: SpokenLanguage, who: FillingFor) => {
      if (lang === "hi" || askedRef.current[fieldKey]) return;
      setTranslating((t) => (t.includes(fieldKey) ? t : [...t, fieldKey]));
      try {
        const res = await fetch("/api/profile/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fieldKey, language: lang, fillingFor: who }),
        });
        const data = (await res.json()) as AskResponse;
        if (data.ok) {
          setAsked((a) => ({
            ...a,
            [fieldKey]: { question: data.question, optionLabels: data.optionLabels },
          }));
          if (data.actionLabels) setActions(data.actionLabels);
        }
      } catch {
        // Leaves the field untranslated; the Hinglish original is the fallback.
      } finally {
        setTranslating((t) => t.filter((k) => k !== fieldKey));
      }
    },
    [],
  );

  // Language changed (or was chosen up front) — warm the questions this user is
  // about to see. Translation takes a few seconds, and the whole point is that
  // somebody who cannot read Hinglish never has to look at it while waiting.
  // The `open` phase gives us that time for free: they are busy talking.
  useEffect(() => {
    if (language === "hi") return;
    // The queue, not just stage 1 — the rail shows real upcoming questions and
    // they have to be readable too, whatever stage they come from.
    const warm = queue(draft.values, draft.skipped).slice(0, 5);
    for (const f of warm) void fetchAsked(f.key, language, draft.fillingFor);
    // Only re-warm when the language or who-is-filling changes, not on every
    // keystroke of progress — the per-field fetch below covers the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, draft.fillingFor, fetchAsked]);

  // Whatever is on screen right now takes priority over the warm-up list —
  // every field in the batch, not just the first, since all of them get
  // spoken together.
  useEffect(() => {
    if (currentBatch.length === 0 || language === "hi") return;
    for (const f of currentBatch) void fetchAsked(f.key, language, draft.fillingFor);
  }, [currentBatch, language, draft.fillingFor, fetchAsked]);

  /** Only honour an open writer while its field is still the one being asked —
   *  and only in one-at-a-time mode. A batch of 2-3 has nowhere to put a full
   *  writer card without crowding out the other questions, so "AI Likhe"
   *  simply isn't offered there (see `onLetAiHelp` below). */
  const bioFor =
    bioKey && currentBatch.length === 1 && currentField?.key === bioKey && currentField.suggestions?.length
      ? currentField
      : null;

  /** Set only while `clarification` is about one of the fields currently
   *  being asked — moving the batch past all of them drops it automatically,
   *  no separate reset needed. */
  const activeClarificationText =
    clarification && currentBatch.some((f) => clarification.turnKeys.includes(f.key))
      ? clarification.text
      : null;

  /**
   * One view-model entry per field in the batch — same per-field logic the
   * single-question card always used (Hinglish original, translated
   * question once it lands, bilingual line underneath when they differ),
   * just computed for up to three fields instead of one.
   */
  const items: BatchQuestionItem[] = useMemo(
    () =>
      currentBatch.map((field) => {
        const localized = asked[field.key];
        const spokenQuestion = questionFor(field, forSelf);
        const askedQuestion = localized?.question ?? spokenQuestion;
        return {
          field,
          askedQuestion,
          bilingualQuestion:
            language !== "hi" && spokenQuestion && askedQuestion !== spokenQuestion ? spokenQuestion : null,
          optionLabels: localized?.optionLabels,
        };
      }),
    [currentBatch, asked, language, forSelf],
  );

  /**
   * Waiting, with nothing translated yet. Showing the Hinglish original here
   * would put text a Marathi speaker cannot read on screen and then swap it —
   * worse than a brief placeholder. Waits for every field in the batch, not
   * just one, so the spoken turn never mixes an untranslated question in with
   * translated ones.
   */
  const awaitingTranslation =
    currentBatch.length > 0 &&
    language !== "hi" &&
    currentBatch.some((f) => !asked[f.key] && translating.includes(f.key));

  /**
   * The natural one-sentence phrasing for 2-3 fields at once — Hindi/Hinglish
   * only for now, since it's built from the catalog's own labels rather than
   * an AI translation call. Other languages still get a working batch turn,
   * just via the per-field questions joined end to end (TargetedVoiceCard's
   * fallback) until this gets its own translation.
   */
  const groupQuestion =
    currentBatch.length > 1 && language === "hi" ? batchQuestionFor(currentBatch, forSelf) : null;

  /**
   * The actual turn — unchanged in spirit, just no longer trusted to run
   * exactly once per tap, *and* no longer trusted to read `currentBatch` for
   * "what was this about". In fast-pace mode `currentBatch` can already have
   * moved on to the next planned batch by the time this actually runs (the
   * whole point), so `askedKeys` arrives as an explicit argument — a
   * snapshot `submit` took at the moment the turn was handed off, not
   * whatever's on screen when this finally executes. `runTurnRef` below
   * still points at *this* render's version, so a queued turn that fires
   * after new answers have landed reads fresh `draft.values`.
   */
  const runTurn = useCallback(
    async (text: string, askedKeys: string[]) => {
      setBusy(true);
      setError(null);
      setLanded([]);
      setLocalGuesses({});
      setClarification(null);

      try {
        const res = await fetch("/api/profile/interview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            transcript: text,
            knownFields: draft.values,
            askedFields: askedKeys,
            fillingFor: draft.fillingFor,
          }),
        });
        const data = (await res.json()) as InterviewResponse;

        if (!data.ok) {
          // A cost refusal is not a breakage: the turn was declined because
          // this account has spent its spoken turns for today, or an admin has
          // voice switched off. The card offers typing instead of asking the
          // user to try again at something that cannot succeed.
          if (data.code === "voice_limit") setVoiceBlocked(true);
          setError(data.message);
          return;
        }

        // Counted per *answered* turn, not per tap: this is the session cap,
        // and it exists so one sitting stays short by design.
        setTurnsThisSession((n) => n + 1);

        // "2-3 details aur" means one round, not a second open interview. The
        // turn has been handed to the extractor, so this round is over and the
        // ready card comes back with the same two choices.
        if (voiceScopeRef.current === "more") setVoiceScope("minimum");

        const entries = toEntries(data.result.extractedFields, data.result.inferredFields);
        const landedKeys = new Set(entries.map((e) => e.key));
        const unresolvedKeys = new Set(data.result.unresolved);

        setValues(entries);
        setLanded(entries.map((e) => e.key));
        haptic("select");

        // A real follow-up, not a generic retry line — only meaningful while
        // one of the fields it's about is still being asked (see
        // `activeClarificationText` above, which re-checks that on every
        // render).
        if (askedKeys.length > 0 && data.result.clarification) {
          setClarification({ turnKeys: askedKeys, text: data.result.clarification });
        }

        // Language decides how the next question is worded — never *which*
        // question, which stays with the gap engine.
        //
        // If the user picked a language, a disagreeing detection becomes an
        // offer instead of a switch. Silently flipping the interface because
        // one sentence read as Marathi is worse than asking.
        const detected = data.result.detectedLanguage;
        if (!draft.languageChosen) {
          setLanguage(detected, false);
        } else if (detected !== draft.language && !langOfferRefused.includes(detected)) {
          setLangOffer(detected);
        }

        if (data.result.userDeclined) {
          // A plain "pata nahi" is an answer about whichever asked field the
          // model still couldn't resolve, not a failed turn — skip exactly
          // those, and only those (a field that *did* land this turn was
          // answered, not declined, even if the user also declined another
          // one in the same breath).
          for (const key of askedKeys) {
            if (unresolvedKeys.has(key) && !landedKeys.has(key)) skipField(key);
          }
        } else if (entries.length === 0) {
          // A turn that produced nothing at all is a genuine miss for every
          // field that was on screen — don't ask the same things forever,
          // let each go after two tries.
          //
          // The test is "nothing at all", not "not one of the asked fields".
          // The rail shows every field in the stage, so a user can answer any
          // of the ones they see and not the ones on screen; that turn is
          // productive, and counting it as a miss would silently skip fields
          // they never declined. They simply come back around in the next
          // batch.
          for (const key of askedKeys) {
            setMisses((m) => {
              const n = (m[key] ?? 0) + 1;
              if (n >= 2) skipField(key);
              return { ...m, [key]: n };
            });
          }
        }
      } catch {
        setError(t("profile.interviewMode.errors.serverUnreachable", "Server se baat nahi ho paayi. Ek baar aur koshish kijiye."));
      } finally {
        setBusy(false);
      }
    },
    [
      draft.values,
      draft.fillingFor,
      draft.language,
      draft.languageChosen,
      langOfferRefused,
      setValues,
      skipField,
      setLanguage,
      t,
    ],
  );

  // Always the latest `runTurn` — see the doc comment above. Updated after
  // every render, read from inside the queue loop below.
  const runTurnRef = useRef(runTurn);
  useEffect(() => {
    runTurnRef.current = runTurn;
  }, [runTurn]);

  /**
   * Non-blocking mic: the drag here used to be that the mic disabled itself
   * the instant a turn was submitted, so a fast talker spent a couple of
   * seconds per answer just waiting for the round trip. The mic itself is
   * never disabled now (AnswerInput/VoiceCapture) — instead every submitted
   * turn lands in this queue and a single drain loop runs them one at a time,
   * so a turn started while the previous one is still in flight is captured
   * rather than dropped or raced.
   */
  const turnQueueRef = useRef<{ text: string; askedKeys: string[] }[]>([]);
  const draining = useRef(false);

  const drainQueue = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    while (turnQueueRef.current.length > 0) {
      const { text, askedKeys } = turnQueueRef.current.shift()!;
      await runTurnRef.current(text, askedKeys);
    }
    draining.current = false;
  }, []);

  const submit = useCallback(
    (text: string) => {
      const askedKeys = currentBatch.map((f) => f.key);

      // Fast pace: hand the conversation forward *now* — the plan's index
      // moves on before this turn's extraction has even been requested, so
      // the next batch is already what gets asked (and spoken) next. Once
      // the plan runs out this is a no-op and `currentBatch` is back to the
      // live pick, same as it always was.
      if (plannedQueue && plannedIndexRef.current < plannedQueue.length) {
        plannedIndexRef.current = Math.min(
          plannedIndexRef.current + Math.max(currentBatch.length, 1),
          plannedQueue.length,
        );
        setPlannedIndex(plannedIndexRef.current);
      }

      turnQueueRef.current.push({ text, askedKeys });
      void drainQueue();
    },
    [drainQueue, currentBatch, plannedQueue],
  );

  /**
   * Upload does not replace the interview — it front-loads it. Whatever the
   * document gives us lands in the same draft, and the gap engine then asks
   * only for what is still missing. That is why there is no separate "review
   * your biodata" screen: the one review screen already covers both sources.
   */
  const uploadBiodata = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setLanded([]);
      setIgnored([]);
      setUploadStage({ phase: "uploading", percent: 0 });

      try {
        const body = new FormData();
        body.append("file", file);
        body.append("fillingFor", draft.fillingFor);

        /*
         * XHR rather than fetch, for one reason: `upload.onprogress`. A
         * scanned biodata on a phone connection is a real upload with a real
         * duration, and `fetch` cannot report it — which is why the card this
         * replaces animated a fake bar instead. Everything else about the
         * request is identical.
         */
        const data = await new Promise<BiodataResponse>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/profile/biodata");
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            setUploadStage({ phase: "uploading", percent: Math.round((e.loaded / e.total) * 100) });
          };
          // The bytes have landed; from here the wait is the model reading the
          // page, which has no progress to report and should not pretend to.
          xhr.upload.onload = () => setUploadStage({ phase: "reading" });
          xhr.onload = () => {
            try {
              resolve(JSON.parse(xhr.responseText) as BiodataResponse);
            } catch {
              reject(new Error("unreadable_response"));
            }
          };
          xhr.onerror = () => reject(new Error("network"));
          xhr.onabort = () => reject(new Error("aborted"));
          xhr.send(body);
        });

        if (!data.ok) {
          setError(data.message);
          return;
        }

        if (!data.result.looksLikeBiodata) {
          setError(
            t(
              "profile.interviewMode.errors.notBiodata",
              "Is file me shaadi ke biodata jaisa kuch nahi mila. Sahi file chunein, ya bol kar bata dijiye.",
            ),
          );
          return;
        }

        const entries = toEntries(data.result.extractedFields, data.result.inferredFields);
        if (entries.length === 0) {
          setError(
            t(
              "profile.interviewMode.errors.biodataUnreadable",
              "File khul gayi par usme se koi detail padhi nahi ja saki. Saaf photo bhejiye ya bol kar bata dijiye.",
            ),
          );
          return;
        }

        setUploadStage({ phase: "preparing" });
        setValues(entries);
        setLanded(entries.map((e) => e.key));
        setIgnored(data.result.ignoredMentions);
        haptic("success");
        setPhase("review");
      } catch {
        setError(t("profile.interviewMode.errors.uploadFailed", "File upload nahi ho paayi. Ek baar aur koshish kijiye."));
      } finally {
        setBusy(false);
        setUploadStage(null);
      }
    },
    [draft.fillingFor, setValues, t],
  );

  /**
   * Who may build a profile by speaking.
   *
   * It used to be: anybody filling for themselves needed an admin-approved
   * exception, requested with a written reason, and waited. That gate existed
   * to bound a per-minute speech bill, and it did — by taking the feature away
   * from the people it was built for. Someone who finds typing hard should not
   * have to type a paragraph asking permission to talk.
   *
   * The bill is bounded per turn instead (see `voiceOnboardingService`): an
   * admin kill switch, a configured provider, a daily turn cap and a session
   * cap. So voice is open to every signed-in account, on any plan, and this is
   * now just "is it switched on and is there budget left today".
   *
   * The reason-request sheet stays reachable for the one case it still fits —
   * an admin has switched voice off entirely — rather than being deleted along
   * with the gate.
   */
  const canUseVoice = voiceAvailability === null ? true : voiceAvailability.available;
  const voiceLockedNote =
    voiceAvailability?.reason === "daily_limit"
      ? t("profile.interviewMode.voiceLocked.dailyLimit", "Aaj ke liye voice ki limit poori. Kal phir bol sakte hain.")
      : voiceAvailability?.reason === "disabled"
        ? t("profile.interviewMode.voiceLocked.disabled", "Voice abhi band hai. Type ya biodata se bhar sakte hain.")
        : undefined;

  // Asked once, when the method screen is reachable. Doing it here rather than
  // on the first spoken word is the point: "AI se Boliye" has to be visibly
  // unavailable *before* somebody commits to it, not after they have already
  // said a sentence into a microphone.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetch("/api/profile/voice-availability")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: VoiceAvailability | null) => {
        if (!cancelled && body) setVoiceAvailability(body);
      })
      .catch(() => {
        /* Unreachable — leave it null, which reads as "assume yes". A network
           blip must not silently remove the microphone; the turn endpoint
           refuses on its own if voice really is off. */
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const submitVoiceRequest = useCallback(async () => {
    const reason = voiceReason.trim();
    if (reason.length < VOICE_REASON_MIN) return;
    setVoiceRequestBusy(true);
    try {
      const res = await fetch("/api/profile/voice-self-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({
          title: t("profile.interviewMode.voiceRequest.sendFailedTitle", "Request bhej nahi paaye"),
          description: json.message,
          tone: "error",
        });
        return;
      }
      setVoiceSelfFillStatus("PENDING");
      setVoiceRequestOpen(false);
      setVoiceReason("");
      toast({
        title: t("profile.interviewMode.voiceRequest.sentTitle", "Request bhej di"),
        description: t("profile.interviewMode.voiceRequest.sentDescription", "Admin review karega — jaldi jawab milega."),
        tone: "success",
      });
    } catch {
      toast({ title: t("profile.interviewMode.voiceRequest.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setVoiceRequestBusy(false);
    }
  }, [voiceReason, setVoiceSelfFillStatus, toast, t]);


  /**
   * What the manual phase covers, written once and handed to whichever deck
   * is on screen (the tap deck by default, the long form if the user asked
   * for it). Every one of these was previously inlined on the single deck —
   * moving them here is what lets the two share a scope rather than each
   * carrying its own copy of the rules.
   */
  const manualDeckProps = {
    onBack: () => {
      if (manualReturnTo) {
        router.push(manualReturnTo);
        return;
      }
      // Anything already answered goes to the review screen — closing a deck
      // with eight answers in it and landing back on "how would you like to
      // fill this in?" reads as having lost them.
      setPhase(live ? "live" : Object.keys(draft.values).length > 0 ? "review" : "method");
    },
    initialFocusKey: manualFocusKey,
    only: manualOnlyKeys
      ? manualOnlyKeys
      : manualCategory
        ? fieldsInCategory(manualCategory).map((f) => f.key)
        : manualGate
          ? GATE_DECK_KEYS
          : null,
    // Editing an answered field is the one case that needs the filled ones
    // present; every other entry point is here to fill gaps, and swiping past
    // thirty answered cards to reach them is the problem this scoping exists
    // to fix.
    //
    // The gate deck opts out: it is nine cards total, so there is no pile to
    // swipe past, and dropping the answered ones would also drop the photo
    // card (photos never appear in draft values, so `pendingOnly` reads them
    // as pending — see `selectDeckFields` in either deck).
    // An explicit key list is already the answer to "which cards" — filtering
    // it again by "not yet answered" would drop the invalid-value rows the
    // review screen sent the user here to fix (they have a value; it just
    // isn't a legal one).
    pendingOnly: !manualOnlyKeys && !manualGate && !manualIncludeFilled,
    scopeLabel: manualOnlyKeys
      ? t("profile.interviewMode.manual.missingScopeLabel", "Baaki zaroori details")
      : manualCategory
        ? t(catalogKey.categoryLabel(manualCategory), FIELD_CATEGORY_BY_KEY[manualCategory].label)
        : manualGate
          ? t("profile.interviewMode.manual.gateScopeLabel", "Zaroori baatein")
          : null,
    gate: manualGate,
  };

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Celebrate trigger={celebrate} origin="top" onDone={() => setCelebrate(false)} />

      {/*
       * Enter-only, keyed on phase. `AnimatePresence` strands its exiting
       * children here: the "who" step contains ChoiceCard's shared-layout
       * `layoutId`, its exit never resolves, and the outgoing step stays
       * painted at full opacity on top of an invisible new one. Same failure
       * as HomePageView — a keyed enter carries the transition with no way to
       * leave the user looking at a question they already answered.
       */}
      {/* Sits above the phases so it survives the keyed remount — an offer
          that vanished on the next question would never get answered.
          Skipped for "targeted": that phase is a full-bleed portal now, so
          this in-flow block would render invisibly behind it — TargetedVoiceCard
          shows the same offer inside the card instead. */}
      {langOffer && phase !== "targeted" && (
        <LanguageSwitchOffer
          detected={langOffer}
          onAccept={() => {
            setLanguage(langOffer, true);
            setLangOffer(null);
          }}
          onDismiss={() => {
            setLangOfferRefused((r) => [...r, langOffer]);
            setLangOffer(null);
          }}
        />
      )}

      <motion.div
        key={phase}
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        // One centered column at every width — a wide two-column shell for the
        // question phase used to earn its keep with a rail beside it; now that
        // "what else can I answer" is a single line under the mic instead of a
        // sidebar, there is nothing left that needs the extra width.
        className="mx-auto max-w-2xl"
      >
        {/* ---------------- Who is filling ---------------- */}
        {phase === "who" && (
          <section className="space-y-6">
            {/*
             * The language control belongs here, before the first spoken word.
             * Speech recognition has to be told the locale up front: a Marathi
             * sentence heard as hi-IN comes back as confident nonsense, so
             * detecting after the fact would already be too late for the
             * sentence that mattered most.
             */}
            <div className="flex items-center justify-end">
              <LanguagePicker
                value={language}
                onChange={(lang) => setLanguage(lang, true)}
              />
            </div>

            {/* One heading, one line, one decision. The "Pehla sawaal" badge
                above it named the screen the screen was already showing, and
                the privacy paragraph that used to sit under the options is now
                the info tip — it is an answer to a question, not a preamble
                everybody has to read first. */}
            <div className="space-y-2">
              <h1 className="flex flex-wrap items-center gap-1.5 text-3xl leading-tight sm:text-4xl">
                {t("profile.interviewMode.who.title", "Ye profile kiske liye hai?")}
                <InfoTip
                  className="align-middle"
                  text={t(
                    "profile.interviewMode.who.privacyTip",
                    "Isse sawaalon ka lehja tay hota hai. Jo aap bharenge wo draft rehta hai — confirm karne tak profile par kuch nahi jaata.",
                  )}
                />
              </h1>
            </div>

            <div className="space-y-3">
              {(
                [
                  {
                    id: "self" as const,
                    title: t("profile.interviewMode.who.selfTitle", "Apne liye"),
                    description: t("profile.interviewMode.who.selfDescription", "Main apni profile bana raha/rahi hoon"),
                  },
                  {
                    id: "son" as const,
                    title: t("profile.interviewMode.who.sonTitle", "Bete ke liye"),
                    description: t(
                      "profile.interviewMode.who.sonDescription",
                      "Main apne bete ki profile bana raha/rahi hoon",
                    ),
                  },
                  {
                    id: "daughter" as const,
                    title: t("profile.interviewMode.who.daughterTitle", "Beti ke liye"),
                    description: t(
                      "profile.interviewMode.who.daughterDescription",
                      "Main apni beti ki profile bana raha/rahi hoon",
                    ),
                  },
                ] satisfies { id: FillingFor; title: string; description: string }[]
              ).map((o) => {
                const Icon = WHO_ICON[o.id];
                return (
                  <ChoiceCard
                    key={o.id}
                    name="filling-for"
                    value={o.id}
                    checked={draft.fillingFor === o.id}
                    // Picking is the answer — there is nothing to confirm, so
                    // the old "Get Started" button was one tap asking the user
                    // to agree with something they had just said. Choosing
                    // moves straight on.
                    onSelect={() => {
                      setFillingFor(o.id);
                      setPhase("method");
                    }}
                    icon={<Icon />}
                    title={o.title}
                    description={o.description}
                  />
                );
              })}
            </div>

          </section>
        )}

        {/* ---------------- Magic Setup — how to fill the profile ---------------- */}
        {phase === "method" && (
          <section className="space-y-6">
            <button
              type="button"
              onClick={() => setPhase("who")}
              className="inline-flex min-h-12 touch-target items-center gap-1.5 text-[0.8125rem] font-medium text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" />
              {t("profile.interviewMode.back", "Back")}
            </button>

            <div className="space-y-2">
              <h1 className="text-3xl leading-tight sm:text-4xl">
                {t("profile.interviewMode.method.title", "Profile kaise banayein?")}
              </h1>
              <p className="text-pretty leading-relaxed text-muted">
                {t("profile.interviewMode.method.description", "Teenon me se koi bhi — sirf 8 zaroori details chahiye.")}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <MagicSetupCard
                icon={Mic}
                tone="gold"
                badge={t("profile.interviewMode.method.voiceBadge", "Sabse Tez")}
                title={t("profile.interviewMode.method.voiceTitle", "AI se Boliye")}
                description={t("profile.interviewMode.method.voiceDescription", "Boliye, AI likh lega.")}
                locked={!canUseVoice}
                lockedNote={voiceLockedNote}
                onSelect={() => {
                  if (canUseVoice) {
                    setPhase("targeted");
                    return;
                  }
                  if (voiceSelfFillStatus === "PENDING") return;
                  setVoiceRequestOpen(true);
                }}
              />
              <MagicSetupCard
                icon={FileUp}
                tone="trust"
                badge={t("profile.interviewMode.method.uploadBadge", "Smart AI Parse")}
                title={t("profile.interviewMode.method.uploadTitle", "Biodata Upload Karein")}
                description={t("profile.interviewMode.method.uploadDescription", "PDF ya photo — AI padh lega.")}
                onSelect={() => openUpload("method")}
              />
              <MagicSetupCard
                icon={ListChecks}
                tone="rose"
                badge={t("profile.interviewMode.method.manualBadge", "Sirf 8 Sawaal")}
                title={t("profile.interviewMode.method.manualTitle", "Khud Bharein")}
                description={t("profile.interviewMode.method.manualDescription", "Tap karke bhariye.")}
                onSelect={() => openManual({ includeFilled: true })}
              />
            </div>
          </section>
        )}

        {/* ---------------- Biodata upload ---------------- */}
        {phase === "upload" && (
          <section className="space-y-7">
            <button
              type="button"
              onClick={() => setPhase(cameFrom)}
              className="inline-flex min-h-12 touch-target items-center gap-1.5 text-[0.8125rem] font-medium text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4" />
              {t("profile.interviewMode.back", "Back")}
            </button>

            <div className="space-y-2">
              <h1 className="flex flex-wrap items-center gap-1.5 text-3xl leading-tight sm:text-4xl">
                {t("profile.interviewMode.upload.title", "Biodata daal dijiye")}
                <InfoTip
                  className="align-middle"
                  text={t(
                    "profile.interviewMode.upload.privacyTip",
                    "File sirf padhne ke liye use hoti hai — profile par kabhi publish nahi hoti. Jo mila wo aap confirm karenge, tabhi lagega.",
                  )}
                />
              </h1>
              <p className="text-pretty leading-relaxed text-muted">
                {t("profile.interviewMode.upload.description", "PDF, photo ya WhatsApp screenshot — sab chalega.")}
              </p>
            </div>

            <BiodataDropZone stage={uploadStage} onFile={uploadBiodata} />
          </section>
        )}

        {/* ---------------- Review: check, fix, go live ---------------- */}
        {phase === "review" && (
          <ProfileReviewPanel
            fromBiodata={ignored.length > 0 || landed.length > 0}
            ignoredMentions={ignored}
            onEdit={setEditKey}
            /* The missing minimum fields as a tap deck, not another spoken
               round: somebody who has just read a list of gaps wants to close
               them, and re-opening the microphone puts a conversation between
               them and three taps. Voice is still one tap away on `method`. */
            onFillMissing={() => {
              setManualOnlyKeys(readiness.blockers.map((b) => b.key));
              openManual({ includeFilled: false, scope: "missing" });
            }}
            onGoLive={() => setPhase("live")}
          />
        )}

        {/* ---------------- Targeted voice interview — one swipeable deck for
            the whole phase, "How fast?" included. That pace question used to
            render standalone, before this deck ever mounted, so it was the
            one screen in the whole flow a forward swipe did nothing on —
            someone who didn't want to answer by voice at all had no way to
            reach the manual card without first tapping through a voice-only
            question. Folding it in as the leadCard for `batchSize === null`
            fixes both at once: swipe works from the very first card, and
            swiping past it (same gesture as any other card here) lands
            straight on the first manual field, exactly like swiping past
            TargetedVoiceCard already does once a pace is chosen. ---------------- */}
        {phase === "targeted" && (
          <ManualProfileFormMobile
            onBack={() =>
              setPhase(live ? "live" : Object.keys(draft.values).length > 0 ? "review" : "method")
            }
            /*
             * The cards *behind* the voice card are the same eight the voice
             * turn is asking about — not the whole catalog.
             *
             * Unscoped, this deck counted 29 cards, so a spoken session that
             * is four questions from done announced "1/29" over the top of it,
             * and a user who swiped past the microphone (the documented way to
             * switch to typing) landed in the full sixty-field form. Scoping it
             * makes the fallback the same promise as the offer.
             */
            only={live ? null : GATE_DECK_KEYS}
            gate={!live}
            scopeLabel={live ? null : t("profile.interviewMode.manual.gateScopeLabel", "Zaroori baatein")}
            leadCard={(goNext) =>
              /* Three ways a spoken session ends, all handled before the
                 question card is even considered — reaching the minimum,
                 spending this sitting's turns, or the server refusing on cost
                 grounds. See VoiceStopCard. */
              voiceReachedMinimum || sessionCapReached || voiceBlocked ? (
                <VoiceStopCard
                  mode={voiceReachedMinimum ? "ready" : voiceBlocked ? "blocked" : "cap"}
                  alreadyLive={live}
                  language={language}
                  onAddMore={() => {
                    // Three more questions, chosen by the same gap engine — not
                    // an open-ended second interview.
                    setVoiceScope("more");
                    setPlannedQueue(null);
                    setPlannedIndex(0);
                    plannedIndexRef.current = 0;
                  }}
                  /* Already live (the autosave got there first) — go straight
                     to the live screen. Not live yet — the review screen is
                     where "Make Profile Live" waits on a real save. */
                  onContinue={() => setPhase(live ? "live" : "review")}
                  onType={goNext}
                  onSaveForNow={saveAndExit}
                />
              ) : bioFor ? (
                /* A field with openers is one people freeze on. The writer gets
                   the whole card rather than sitting under the box, because
                   splitting attention between "write it yourself" and "let me
                   help" is how neither gets done. */
                <BioWriter
                  prompts={bioFor.suggestions ?? []}
                  knownFields={draft.values}
                  language={language}
                  fillingFor={draft.fillingFor}
                  actions={actions}
                  onCancel={() => setBioKey(null)}
                  onDone={(text) => {
                    setBioKey(null);
                    setValues([
                      { key: bioFor.key, value: text, meta: { source: "user", confirmed: true } },
                    ]);
                    haptic("success");
                  }}
                />
              ) : (
                <TargetedVoiceCard
                  items={items}
                  groupQuestion={groupQuestion}
                  railFields={railFields}
                  draftValues={draft.values}
                  draftMeta={draft.meta}
                  localGuesses={localGuesses}
                  landed={landed}
                  onEdit={setEditKey}
                  busy={busy}
                  error={error}
                  clarification={activeClarificationText}
                  awaitingTranslation={awaitingTranslation}
                  misses={misses}
                  language={language}
                  onLanguageChange={(lang) => setLanguage(lang, true)}
                  langOffer={langOffer}
                  onAcceptLangOffer={() => {
                    setLanguage(langOffer!, true);
                    setLangOffer(null);
                  }}
                  onDismissLangOffer={() => {
                    setLangOfferRefused((r) => [...r, langOffer!]);
                    setLangOffer(null);
                  }}
                  actions={actions}
                  onSubmit={submit}
                  onInterimChange={(t) => setLocalGuesses(t ? detectLocalGuesses(t) : {})}
                  onUploadBiodata={() => openUpload("targeted")}
                  onFillForm={goNext}
                  onLetAiHelp={
                    currentBatch.length === 1 && currentField?.suggestions && currentField.suggestions.length > 0
                      ? () => {
                          haptic("tap");
                          setBioKey(currentField.key);
                        }
                      : undefined
                  }
                  onSkip={
                    // Past the minimum gate nothing is mandatory any more, so
                    // "skip" ends the extra round instead of blackballing a
                    // field — `queue()` ignores a skip on a required field
                    // anyway, so marking these would have looked like a no-op.
                    voiceScope === "more"
                      ? () => {
                          haptic("tap");
                          setVoiceScope("minimum");
                        }
                      : currentBatch.some((f) => !f.required)
                        ? () => {
                            for (const f of currentBatch) if (!f.required) skipField(f.key);
                            haptic("tap");
                          }
                        : undefined
                  }
                  /* The minimum gate's counter while that is what's being
                     asked. Past it (the "2-3 aur" round) there is no bar to
                     fill, and inventing one would imply an obligation the
                     user has already been told they don't have. */
                  progress={
                    voiceScope === "minimum"
                      ? { done: readiness.done, total: readiness.total }
                      : null
                  }
                  onSaveForNow={saveAndExit}
                  batchSize={batchSize}
                  onBatchSizeChange={(size) => {
                    setBatchSize(size);
                    // The fixed running order was sliced at the old width, so
                    // it has to be re-planned or the next turn would ask three
                    // fields' worth of questions one at a time.
                    setPlannedQueue(null);
                    setPlannedIndex(0);
                    plannedIndexRef.current = 0;
                  }}
                />
              )
            }
          />
        )}

        {/* ---------------- Special: mindset / vibe, once ---------------- */}
        {phase === "mindset" && (
          /* No celebration on the way back: the profile went live before this
             screen was ever opened, and confetti for answering three optional
             questions is the product congratulating itself. */
          <MindsetFlow onDone={() => setPhase("live")} />
        )}

        {/* ---------------- Manual fill, no AI ---------------- */}
        {/* Two decks over one scope. `SmartProfileDeck` is the default: one
            question a card, tap to answer, the card moves on its own.
            `ManualProfileFormMobile` is the same field set as a long form,
            reached only from the deck's own "Open Detailed Form" — kept
            because a rare answer, or simply a preference for a form, should
            never be a dead end. Both take the same scope props
            (`manualDeckProps`), so the scoping rules are written once. */}
        {phase === "manual" &&
          (manualLongForm ? (
            <ManualProfileFormMobile {...manualDeckProps} />
          ) : (
            <SmartProfileDeck {...manualDeckProps} onOpenFullForm={() => setManualLongForm(true)} />
          ))}

        {/* ---------------- Live: add more now, or go in ---------------- */}
        {phase === "live" && (
          <section className="space-y-6">
            {/*
             * Step 5 of the journey, and one question: more now, or in?
             *
             * What used to be here was a hero card, two buttons, a Quick Access
             * card of four links, and the whole Samajh Map — a map of the app
             * rendered on the screen whose entire job is to hand the user to
             * the app. The map is still one tap away; it is just no longer the
             * answer to "you finished, what now?".
             */}
            <div className="space-y-2 text-center">
              <BadgeCheck className="mx-auto size-10 text-trust" />
              <h1 className="text-3xl leading-tight sm:text-4xl">
                {t("profile.interviewMode.live.title", "Aapki profile live hai")}
              </h1>
              <p className="text-pretty leading-relaxed text-muted">
                {t("profile.interviewMode.live.description", "Ab aapko rishte dikhne lagenge.")}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                href="/user/dashboard"
                className={cn(
                  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-8 text-base font-semibold",
                  "bg-accent text-accent-fg shadow-md transition-all duration-200 hover:-translate-y-0.5",
                  "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                )}
              >
                {t("profile.interviewMode.live.viewDashboard", "Go to Dashboard")}
                <ArrowRight className="size-4" />
              </Link>
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={() => openManual({ includeFilled: false })}
              >
                {t("profile.interviewMode.live.addMoreDetails", "Add More Details")}
              </Button>
            </div>

            {/* Everything else this screen used to shout, behind one tap. */}
            <details className="group rounded-lg border border-line bg-surface">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-[0.875rem] font-medium text-muted">
                {t("profile.interviewMode.live.moreOptions", "Aur kya kar sakte hain")}
                <ArrowRight className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-90" />
              </summary>
              <div className="space-y-1 border-t border-line px-2 py-2">
                <Link
                  href="/user/profile/preview"
                  className="flex min-h-12 items-center gap-3 rounded-md px-2 text-[0.875rem] font-medium text-ink transition-colors hover:bg-bg-subtle"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                    <Sparkles className="size-4" />
                  </span>
                  {t("profile.interviewMode.live.previewLink", "Preview My Reel Card")}
                </Link>
                <button
                  type="button"
                  onClick={() => openManual({ includeFilled: true })}
                  className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left text-[0.875rem] font-medium text-ink transition-colors hover:bg-bg-subtle"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                    <ListChecks className="size-4" />
                  </span>
                  {t("profile.interviewMode.live.fullProfileForm", "Full Profile Form")}
                </button>
                <Link
                  href="/user/profile/me"
                  className="flex min-h-12 items-center gap-3 rounded-md px-2 text-[0.875rem] font-medium text-ink transition-colors hover:bg-bg-subtle"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                    <User className="size-4" />
                  </span>
                  {t("profile.interviewMode.live.viewMyProfile", "View My Profile")}
                </Link>
                {!mindsetDone && (
                  <button
                    type="button"
                    onClick={() => setPhase("mindset")}
                    className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left text-[0.875rem] font-medium text-ink transition-colors hover:bg-bg-subtle"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                      <Flame className="size-4" />
                    </span>
                    {t("profile.interviewMode.live.mindset", "3 Quick Vibe Questions")}
                  </button>
                )}
                <Link
                  href="/user/grio-map"
                  className="flex min-h-12 items-center gap-3 rounded-md px-2 text-[0.875rem] font-medium text-ink transition-colors hover:bg-bg-subtle"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                    <Sparkles className="size-4" />
                  </span>
                  {t("profile.interviewMode.live.grioMap", "Grio Map")}
                </Link>
              </div>
            </details>
          </section>
        )}
      </motion.div>

      {/* Skipped for "targeted" — that phase is a full-bleed portal now, so
          this in-flow banner would render invisibly behind it;
          TargetedVoiceCard shows `error` inside the card instead. */}
      {error && phase !== "targeted" && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-bg px-4 py-3 text-[0.8125rem] leading-snug text-danger"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {/* "targeted" has its own rail now (chips fixed to the stage, not a
          reshuffling tray), so this sticky-bottom tray is only needed for
          upload/harvest/live. Not sticky on "live" specifically — nobody is
          actively speaking on the completion screen, so floating over
          whatever comes after it (the disclaimer used to, now nothing does)
          has no upside there. */}
      {/*
       * Only `upload` still wants the tray.
       *
       * `review` lists every value already, with controls on the ones that
       * need them — the tray under it was the same eight facts a second time.
       * `live` asks exactly one question ("more now, or in?") and a panel of
       * chips beneath it is a third answer nobody asked for; editing lives one
       * tap down, under "Aur kya kar sakte hain".
       */}
      {phase === "upload" && (
        <DraftTrayMobile highlight={landed} onEdit={setEditKey} sticky />
      )}

      <FieldEditSheet fieldKey={editKey} onClose={() => setEditKey(null)} />

      <Sheet
        open={voiceRequestOpen}
        onClose={() => {
          setVoiceRequestOpen(false);
          setVoiceReason("");
        }}
        title={t("profile.interviewMode.voiceRequest.sheetTitle", "Apne liye bol kar profile banana chahte hain?")}
        description={t(
          "profile.interviewMode.voiceRequest.sheetDescription",
          "Ye sirf parents ke liye khula hai. Apne liye chahiye to bataiye kyun — admin dekh kar jaldi jawab dega.",
        )}
        variant="center"
      >
        <div className="space-y-3">
          <Textarea
            value={voiceReason}
            onChange={(e) => setVoiceReason(e.target.value)}
            placeholder={t("profile.interviewMode.voiceRequest.reasonPlaceholder", "Jaise: likhna mushkil hai, aankhon me dikkat hai…")}
            rows={4}
            maxLength={VOICE_REASON_MAX}
            showCount
          />
          <p className="text-[0.6875rem] text-subtle">
            {t("profile.interviewMode.voiceRequest.minCharacters", "Kam se kam {count} characters.").replace(
              "{count}",
              String(VOICE_REASON_MIN),
            )}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="accent"
              size="md"
              fullWidth
              loading={voiceRequestBusy}
              disabled={voiceReason.trim().length < VOICE_REASON_MIN}
              onClick={submitVoiceRequest}
            >
              {t("profile.interviewMode.voiceRequest.sendButton", "Send Request")}
            </Button>
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => {
                setVoiceRequestOpen(false);
                setVoiceReason("");
              }}
            >
              {t("profile.interviewMode.voiceRequest.cancelButton", "Cancel")}
            </Button>
          </div>
        </div>
      </Sheet>

    </div>
  );
}
