"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleAlert,
  FileUp,
  ListChecks,
  Loader2,
  Mic,
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
import { FIELD_BY_KEY, batchQuestionFor, fieldsForStage, questionFor, type ProfileFieldDef } from "@/lib/profile/fields";
import { missingRequired, nextBatch, queue } from "@/lib/profile/stages";
import { isMindsetAnswered } from "@/lib/profile/mindset";
import { detectLocalGuesses, type LocalGuess } from "@/lib/profile/localDetect";
import { VOICE_REASON_MAX, VOICE_REASON_MIN } from "@/lib/profile/voiceAccessConstants";
import { useProfile } from "@/lib/profile/profileState";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
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
import TargetedVoiceCard, { type BatchQuestionItem } from "@/components/profile/TargetedVoiceCard";
import PacePreferenceCard from "@/components/profile/PacePreferenceCard";
import { DraftTrayMobile } from "@/components/profile/DraftTray";
import NavHub from "@/components/layout/NavHub";
import { useT } from "@/components/i18n/LanguageProvider";

/* ------------------------------------------------------------------ */

type Phase = "who" | "method" | "upload" | "harvest" | "targeted" | "mindset" | "manual" | "live";

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
/* What the biodata actually gave us                                   */
/* ------------------------------------------------------------------ */

/**
 * The harvest screen.
 *
 * Landing straight on the next question after an upload throws away the one
 * moment that proves the import worked (07_advanced_ai_spec §2.1). So the
 * fields are counted and shown, split by whether they still need the user's
 * eyes, along with what could not be used — and only then does the interview
 * pick up again, now asking for less.
 */
function HarvestPanel({
  landed,
  ignored,
  remaining,
  onContinue,
}: {
  landed: string[];
  ignored: string[];
  remaining: number;
  onContinue: () => void;
}) {
  const t = useT();
  const { draft } = useProfile();

  const rows = landed
    .map((key) => ({ key, value: draft.values[key], def: FIELD_BY_KEY[key], meta: draft.meta[key] }))
    .filter((r) => r.def && r.value);

  const sure = rows.filter((r) => r.meta?.confirmed !== false);
  const check = rows.filter((r) => r.meta?.confirmed === false);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Pill tone="trust" size="sm">
          <Check />
          {t("profile.interviewMode.harvest.readBadge", "Padh liya")}
        </Pill>
        <h1 className="text-3xl leading-tight sm:text-4xl">
          {t("profile.interviewMode.harvest.title", "Biodata se {count} baatein bhar gayi").replace(
            "{count}",
            String(rows.length),
          )}
        </h1>
        <p className="text-pretty leading-relaxed text-muted">
          {remaining > 0
            ? t(
                "profile.interviewMode.harvest.remainingDescription",
                "{count} zaroori baatein baaki hain — wo main poochh lunga. Baar-baar wahi nahi poochhunga jo mil gaya.",
              ).replace("{count}", String(remaining))
            : t("profile.interviewMode.harvest.allDoneDescription", "Zaroori sab kuch mil gaya. Ek baar dekh lijiye.")}
        </p>
      </div>

      {check.length > 0 && (
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-[0.8125rem] font-semibold text-warn">
            <CircleAlert className="size-4" />
            {t("profile.interviewMode.harvest.checkCount", "{count} par mujhe pura bharosa nahi — dekh lijiye").replace(
              "{count}",
              String(check.length),
            )}
          </p>
          <ul className="space-y-1.5">
            {check.map((r) => (
              <li
                key={r.key}
                className="rounded-md border border-warn/30 bg-warn-bg px-3.5 py-2.5"
              >
                <span className="block text-[0.6875rem] uppercase tracking-wider text-subtle">
                  {r.def.label}
                  {r.meta?.source === "inferred" && (
                    <span className="ml-1.5 normal-case tracking-normal text-info">
                      {t("profile.interviewMode.harvest.aiInferred", "· AI ne nikala")}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[0.9375rem] font-medium text-ink">{r.value}</span>
                {r.meta?.inferredFrom && (
                  <span className="mt-1 block text-[0.75rem] leading-snug text-muted">
                    {r.meta.inferredFrom}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sure.length > 0 && (
        <div className="space-y-2">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
            {t("profile.interviewMode.harvest.clearlyReceivedLabel", "Ye saaf-saaf mil gaya")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {sure.map((r) => (
              <li
                key={r.key}
                className="rounded-full border border-trust/25 bg-trust-bg px-3 py-1.5 text-[0.8125rem] text-ink"
              >
                <span className="text-subtle">{r.def.label}:</span> {r.value}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* A biodata carries headings we have no field for — Rashi, Complexion,
          Blood group. Saying so is cheap; letting them vanish silently is what
          makes people distrust an importer. */}
      {ignored.length > 0 && (
        <div className="rounded-md border border-line bg-bg-subtle px-4 py-3">
          <p className="text-[0.8125rem] leading-snug text-muted">
            {t("profile.interviewMode.harvest.ignoredPrefix", "Biodata me")}{" "}
            <span className="font-medium text-ink">{ignored.join(", ")}</span>{" "}
            {t(
              "profile.interviewMode.harvest.ignoredSuffix",
              "bhi likha tha — inke liye abhi humare paas jagah nahi hai, to inhe chhod diya.",
            )}
          </p>
        </div>
      )}

      <Button variant="accent" size="lg" fullWidth onClick={onContinue}>
        {t("profile.interviewMode.continue", "Continue")}
        <ArrowRight className="size-4" />
      </Button>

      <p className="flex items-start gap-2.5 text-[0.8125rem] leading-snug text-muted">
        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary-text" />
        {t("profile.interviewMode.harvest.draftDisclaimer", "Ye sab abhi draft hai. Aapke confirm karne tak profile me kuch nahi jaata.")}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Biodata drop zone                                                   */
/* ------------------------------------------------------------------ */

function BiodataDropZone({
  busy,
  onFile,
}: {
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const t = useT();
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState<string | null>(null);

  function take(file: File | undefined) {
    if (!file || busy) return;
    haptic("tap");
    setName(file.name);
    onFile(file);
  }

  if (busy) {
    // Reading a scanned page takes real seconds. Saying what is happening beats
    // a bare spinner, because the wait is the part users assume has hung.
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-bg-subtle px-6 py-12 text-center">
        <Loader2 className="size-7 animate-spin text-primary-text" />
        <p className="text-[0.9375rem] font-semibold text-ink">
          {name
            ? t("profile.interviewMode.upload.readingNamed", "{name} padha ja raha hai…").replace("{name}", name)
            : t("profile.interviewMode.upload.readingGeneric", "Biodata padha ja raha hai…")}
        </p>
        <p className="max-w-xs text-[0.8125rem] leading-snug text-muted">
          {t(
            "profile.interviewMode.upload.readingDescription",
            "Har line dekhi ja rahi hai. Jo saaf na ho wo main aapse poochh lunga — apne se bhar nahi dunga.",
          )}
        </p>
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
    stage,
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
   * How many fields get asked together in one voice turn. `null` means "not
   * decided yet" — `PacePreferenceCard` asks once, out loud, the first time
   * "targeted" is reached from any path (resume, biodata harvest, first open
   * turn, "Add More Details"), and every one of those paths goes through
   * that same gate so it can only ever run once per session. "Ask One at a
   * Time" (the open-phase link) sets this to 1 directly and skips the
   * question — that tap already answered it.
   */
  const [batchSize, setBatchSize] = useState<number | null>(null);
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
  /** The "apne liye bolna hai, reason batayein" sheet — voice-for-self is
   *  admin-approved only, see VoiceSelfFillStatus. */
  const [voiceRequestOpen, setVoiceRequestOpen] = useState(false);
  const [voiceReason, setVoiceReason] = useState("");
  const [voiceRequestBusy, setVoiceRequestBusy] = useState(false);

  const openUpload = useCallback((from: Phase) => {
    haptic("tap");
    setCameFrom(from);
    setPhase("upload");
  }, []);
  const wasLive = useRef(false);

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
      setPhase("manual");
      return;
    }
    if (live) setPhase("live");
    else if (Object.keys(draft.values).length > 0) setPhase("targeted");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (live && !wasLive.current) {
      wasLive.current = true;
      haptic("success");
      // The mindset flow gets one shot, right as the profile goes live — a
      // returning user who already answered (or explicitly skipped) it never
      // sees it again.
      const mindsetSeen = isMindsetAnswered(draft.values) || draft.skipped.includes("mindsetFlow");
      if (mindsetSeen) {
        setCelebrate(true);
        setPhase("live");
      } else {
        setPhase("mindset");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Snapshot the fast-pace running order exactly once per stage — as soon as
  // voice mode is actually about to ask something (batchSize decided). Scoped
  // to the current stage on purpose, same as `railFields` below: the plan is
  // a one-time thing for *this* burst of questions, not a promise to fast-fire
  // through the entire remaining catalog.
  useEffect(() => {
    if (phase !== "targeted" || batchSize === null || plannedQueue !== null) return;
    const fields = queue(draft.values, draft.skipped).filter((f) => f.stage === stage);
    setPlannedQueue(fields);
    setPlannedIndex(0);
    plannedIndexRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, batchSize, plannedQueue]);

  const forSelf = draft.fillingFor === "self";
  const currentBatch: ProfileFieldDef[] = useMemo(() => {
    if (phase !== "targeted" || batchSize === null) return [];
    // Still inside the fast-planned pass — slice off the fixed order rather
    // than asking the gap engine, which would need `draft.values` to already
    // reflect turns whose extraction hasn't landed yet.
    if (plannedQueue && plannedIndex < plannedQueue.length) {
      return plannedQueue.slice(plannedIndex, plannedIndex + batchSize);
    }
    // Plan exhausted (or never applicable, e.g. resuming mid-draft into a
    // later stage) — back to the live pick, exactly as before fast pace
    // existed. This is also the mop-up round: anything the plan asked about
    // but didn't land reappears here for real, since it's still unanswered.
    return nextBatch(draft.values, draft.skipped, batchSize);
  }, [phase, batchSize, plannedQueue, plannedIndex, draft.values, draft.skipped]);
  const currentField: ProfileFieldDef | null = currentBatch[0] ?? null;

  /** The whole current stage, fixed — what QuestionRail renders. */
  const railFields = useMemo(
    () => fieldsForStage(stage).filter((f) => f.aiExtractable),
    [stage],
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
          setError(data.message);
          return;
        }

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

      try {
        const body = new FormData();
        body.append("file", file);
        body.append("fillingFor", draft.fillingFor);

        const res = await fetch("/api/profile/biodata", { method: "POST", body });
        const data = (await res.json()) as BiodataResponse;

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

        setValues(entries);
        setLanded(entries.map((e) => e.key));
        setIgnored(data.result.ignoredMentions);
        haptic("success");
        setPhase("harvest");
      } catch {
        setError(t("profile.interviewMode.errors.uploadFailed", "File upload nahi ho paayi. Ek baar aur koshish kijiye."));
      } finally {
        setBusy(false);
      }
    },
    [draft.fillingFor, setValues, t],
  );

  /**
   * Voice defaults to "for a child" — see VoiceSelfFillStatus. Filling for
   * self needs an admin-approved exception, requested here with a reason.
   */
  const canUseVoice = draft.fillingFor !== "self" || voiceSelfFillStatus === "APPROVED";
  const voiceLockedNote =
    draft.fillingFor === "self"
      ? voiceSelfFillStatus === "PENDING"
        ? t("profile.interviewMode.voiceLocked.pending", "Aapki request review ho rahi hai.")
        : voiceSelfFillStatus === "REJECTED"
          ? t("profile.interviewMode.voiceLocked.rejected", "Pichhli request approve nahi hui hai. Dobara reason bata sakte hain.")
          : t(
              "profile.interviewMode.voiceLocked.notRequested",
              "Abhi sirf bete/beti ke liye khula hai. Apne liye chahiye? Reason batayein.",
            )
      : undefined;

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
            <div className="flex items-center justify-between gap-3">
              <Pill tone="gold" size="sm">
                <Sparkles />
                {t("profile.interviewMode.who.badge", "Pehla sawaal")}
              </Pill>
              <LanguagePicker
                value={language}
                onChange={(lang) => setLanguage(lang, true)}
              />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl leading-tight sm:text-4xl">
                {t("profile.interviewMode.who.title", "Ye profile kiske liye hai?")}
              </h1>
              <p className="text-pretty leading-relaxed text-muted">
                {t("profile.interviewMode.who.description", "Isse mujhe pata chalta hai ki sawaal kis tarah poochhne hain.")}
              </p>
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
                    onSelect={() => setFillingFor(o.id)}
                    icon={<Icon />}
                    title={o.title}
                    description={o.description}
                  />
                );
              })}
            </div>

            <Button variant="accent" size="lg" fullWidth onClick={() => setPhase("method")}>
              {t("profile.interviewMode.getStarted", "Get Started")}
              <ArrowRight className="size-4" />
            </Button>

            <p className="flex items-start gap-2.5 text-[0.8125rem] leading-snug text-muted">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary-text" />
              {t("profile.interviewMode.who.saveDisclaimer", "Kuch bhi save nahi hota jab tak aap review karke confirm na karein.")}
            </p>
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
              <Pill tone="gold" size="sm">
                <Sparkles />
                {t("profile.interviewMode.method.badge", "Magic Setup")}
              </Pill>
              <h1 className="text-3xl leading-tight sm:text-4xl">
                {t("profile.interviewMode.method.title", "Profile kaise banayein?")}
              </h1>
              <p className="text-pretty leading-relaxed text-muted">
                {t("profile.interviewMode.method.description", "Jo tarika aapko sabse aasaan lage wo chunein — baaki AI sambhal lega.")}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <MagicSetupCard
                icon={Mic}
                tone="gold"
                badge={t("profile.interviewMode.method.voiceBadge", "Sabse Tez")}
                title={t("profile.interviewMode.method.voiceTitle", "AI se Boliye")}
                description={t(
                  "profile.interviewMode.method.voiceDescription",
                  "Bas apni baat boliye — AI sun kar profile khud bhar dega.",
                )}
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
                description={t(
                  "profile.interviewMode.method.uploadDescription",
                  "Pehle se bana biodata (PDF ya photo) daaliye, AI usse padh kar bhar dega.",
                )}
                onSelect={() => openUpload("method")}
              />
              <MagicSetupCard
                icon={ListChecks}
                tone="rose"
                badge={t("profile.interviewMode.method.manualBadge", "Poora Control")}
                title={t("profile.interviewMode.method.manualTitle", "Khud Bharein")}
                description={t(
                  "profile.interviewMode.method.manualDescription",
                  "Har field seedha type ya tap karke bhariye — na mic, na AI ka wait.",
                )}
                onSelect={() => setPhase("manual")}
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
              <Pill tone="gold" size="sm">
                <FileUp />
                {t("profile.interviewMode.upload.badge", "Biodata se")}
              </Pill>
              <h1 className="text-3xl leading-tight sm:text-4xl">
                {t("profile.interviewMode.upload.title", "Jo biodata bana hua hai, wahi daal dijiye")}
              </h1>
              <p className="text-pretty leading-relaxed text-muted">
                {t(
                  "profile.interviewMode.upload.description",
                  "Photo bhi chalegi — WhatsApp se aaya screenshot bhi. Jo padha ja sakega wo bhar jayega, baaki main poochh lunga.",
                )}
              </p>
            </div>

            <BiodataDropZone busy={busy} onFile={uploadBiodata} />

            <p className="flex items-start gap-2.5 text-[0.8125rem] leading-snug text-muted">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary-text" />
              {t(
                "profile.interviewMode.upload.disclaimer",
                "File sirf details padhne ke liye use hoti hai. Aapki profile par ye kabhi publish nahi hoti, aur kuch bhi save nahi hota jab tak aap confirm na karein.",
              )}
            </p>
          </section>
        )}

        {/* ---------------- What the biodata gave us ---------------- */}
        {phase === "harvest" && (
          <HarvestPanel
            landed={landed}
            ignored={ignored}
            remaining={missingRequired(draft.values).length}
            onContinue={() => setPhase("targeted")}
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
            onBack={() => setPhase(live ? "live" : "method")}
            leadCard={(goNext) =>
              batchSize === null ? (
                <PacePreferenceCard language={language} actions={actions} onChoose={setBatchSize} />
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
                    currentBatch.some((f) => !f.required)
                      ? () => {
                          for (const f of currentBatch) if (!f.required) skipField(f.key);
                          haptic("tap");
                        }
                      : undefined
                  }
                />
              )
            }
          />
        )}

        {/* ---------------- Special: mindset / vibe, once ---------------- */}
        {phase === "mindset" && (
          <MindsetFlow
            onDone={() => {
              setCelebrate(true);
              setPhase("live");
            }}
          />
        )}

        {/* ---------------- Manual form: whole catalog, no AI ---------------- */}
        {/* Reel/Stories-style swipeable cards, same on every screen size —
            there is only the one manual-fill experience now. */}
        {phase === "manual" && (
          <ManualProfileFormMobile
            onBack={() => setPhase(live ? "live" : "method")}
            initialFocusKey={manualFocusKey}
          />
        )}

        {/* ---------------- Stage 1 cleared ---------------- */}
        {phase === "live" && (
          <section className="space-y-6">
            <Link
              href="/user/profile/preview"
              className="block rounded-lg border border-trust/25 bg-trust-bg px-5 py-8 text-center transition-colors hover:bg-trust-bg/70"
            >
              <BadgeCheck className="mx-auto size-10 text-trust" />
              <h1 className="mt-3 text-2xl leading-tight">
                {t("profile.interviewMode.live.title", "Aapki profile ab live hai")}
              </h1>
              <p className="mx-auto mt-2 max-w-md text-pretty leading-relaxed text-muted">
                {t(
                  "profile.interviewMode.live.description",
                  "Zaroori baatein poori ho gayin. Ab aap rishte dekh sakte hain — aur jitna aur bharenge, utne behtar rishte milenge.",
                )}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-trust underline underline-offset-2">
                {t("profile.interviewMode.live.previewLink", "Meri Reel Preview Dekhein")}
                <ArrowRight className="size-3.5" />
              </span>
            </Link>

            <div className="flex flex-col gap-3 sm:flex-row">
              {/* Straight to the typed card deck, not the voice interview —
                  this button is for someone whose profile is already live and
                  just wants the remaining/optional fields, not another spoken
                  question-and-answer round. Voice is still on offer, but only
                  as an explicit choice on "method", the first-time setup
                  screen — never as the default for a top-up like this one. */}
              <Button
                size="lg"
                fullWidth
                onClick={() => {
                  setPhase("manual");
                  haptic("tap");
                }}
              >
                {t("profile.interviewMode.live.addMoreDetails", "Add More Details")}
                <ArrowRight className="size-4" />
              </Button>
              <Link
                href="/user/dashboard"
                className={cn(
                  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-8 text-base font-semibold",
                  "border border-line-strong bg-surface text-ink shadow-xs transition-all duration-200",
                  "hover:-translate-y-0.5 hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/40",
                  "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                )}
              >
                {t("profile.interviewMode.live.viewDashboard", "View Dashboard")}
              </Link>
            </div>

            {/* Quick Access — photo upload/edit already lives on "Meri
                Profile" (SelfPhotoGallery, app/user/profile/[id]/page.tsx),
                so it isn't duplicated here. Icon rows in one card rather than
                stacked underlined text links — same pattern as the Circle
                page's "kaise chalta hai" list. */}
            <Card variant="soft" padding="md">
              <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-wine-700">
                {t("profile.interviewMode.live.quickAccess", "Quick Access")}
              </p>
              <div className="mt-3 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    setPhase("manual");
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 -mx-2 text-left transition-colors hover:bg-bg-subtle"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                    <ListChecks className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-[0.875rem] font-medium text-ink">
                    {t("profile.interviewMode.live.fullProfileForm", "Full Profile Form")}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-subtle" />
                </button>

                <Link
                  href="/user/profile/me"
                  className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 -mx-2 text-left transition-colors hover:bg-bg-subtle"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                    <User className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-[0.875rem] font-medium text-ink">
                    {t("profile.interviewMode.live.viewMyProfile", "View My Profile")}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-subtle" />
                </Link>
              </div>
            </Card>

            {/* The same NavHub the sidebar and the More sheet render, so this
                page can never drift out of sync with the real nav — which is
                exactly what happened to the hand-written version it replaces.
                This screen sits outside UserShell (profile editing lives in
                app/(onboarding)), so the hub is the only nav on it. */}
            <Card variant="soft" padding="md">
              <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-wine-700">
                {t("profile.interviewMode.live.wholeBandhanTak", "Poora BandhanTak")}
              </p>
              <NavHub variant="card" className="mt-2 -mx-1" />
            </Card>
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
      {phase !== "who" && phase !== "targeted" && phase !== "mindset" && phase !== "manual" && (
        <DraftTrayMobile highlight={landed} onEdit={setEditKey} sticky={phase !== "live"} />
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

      {/* Only meaningful while the AI is actively inferring things — the
          "live" screen has nothing left to confirm. */}
      {phase !== "who" && phase !== "manual" && phase !== "targeted" && phase !== "live" && (
        <p className="flex items-start gap-2.5 text-[0.75rem] leading-snug text-subtle">
          <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-primary-text" />
          {t(
            "profile.interviewMode.aiDraftDisclaimer",
            "Jo AI ne samjha wo abhi draft hai. Aapke confirm karne se pehle profile me kuch nahi jaata, aur jo samajh na aaye wo khaali hi rehta hai — apne aap kuch bhara nahi jaata.",
          )}
        </p>
      )}

    </div>
  );
}
