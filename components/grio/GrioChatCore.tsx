"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrainCircuit, FileText, Loader2, Mic, Radio, Sparkles, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import { useGrio } from "./GrioProvider";
import GrioMatchPicker from "./GrioMatchPicker";
import GrioPersonPicker from "./GrioPersonPicker";
import GrioSendConfirm from "./GrioSendConfirm";
import GrioActionChips, {
  type GrioActionRequest,
  type GrioActionTargetRef,
} from "./GrioActionChips";
import GrioVoiceNoteSheet from "./GrioVoiceNoteSheet";
import GrioAnswerSheet from "./GrioAnswerSheet";
import GrioPollSheet from "./GrioPollSheet";
import GrioDeck from "./GrioDeck";
import GrioMemoryPanel from "./GrioMemoryPanel";
import { useGrioVoice } from "./useGrioVoice";
import { runGrioAction } from "./runGrioAction";
import SuggestedMessageCard from "./SuggestedMessageCard";
import {
  type ConciergeBriefingResponse,
  type ConciergeMessage,
  type ConciergeMatchOption,
  type ConciergeResponse,
  type ConciergeRosterEntry,
  type ConciergeWalkthroughStep,
} from "@/lib/contracts/concierge";
import type { GrioScope } from "./GrioProvider";
import {
  GRIO_ACTIONS,
  parseGrioSegments,
  type GrioActionKey,
  type GrioActionSheet,
  type GrioActionSpec,
} from "@/lib/contracts/grio";
import { QUESTION_MAX_LENGTH, type AskQuestionResponse } from "@/lib/contracts/askBridge";

/**
 * Reading "haan" or "na" off a spoken confirmation.
 *
 * Strict on purpose, and asymmetrically so. The cost of misreading a "no" as a
 * "yes" is an interest sent to a real person; the cost of misreading anything as
 * "unclear" is that the user repeats themselves. So a negation anywhere wins
 * outright ("haan — nahi, ruko" is a person changing their mind mid-sentence),
 * and a "yes" is only accepted when the *whole* utterance is agreement: every
 * word has to be an affirmation or one of the small words that ride along with
 * one. "haan bhej do" is a yes; "haan par pehle batao ki kitna quota bacha hai"
 * is a question with the word haan in front of it, and treating those the same
 * is how a confirmation stops meaning anything.
 */
const CONFIRM_YES = new Set([
  "haan", "han", "haa", "ha", "hn", "ji", "yes", "yeah", "yep", "ok", "okay", "theek", "thik",
  "sahi", "bilkul", "zaroor", "jaroor", "jarur", "sure", "done", "chalo",
]);
const CONFIRM_NO = new Set([
  "na", "naa", "nahi", "nahin", "nai", "no", "nope", "mat", "cancel", "rehne", "rahne", "chhodo",
  "chodo", "ruko", "rukiye", "ruk",
]);
/** Words that carry no decision of their own and may accompany a yes. */
const CONFIRM_FILLER = new Set([
  "bhej", "bhejo", "do", "dijiye", "dena", "de", "kar", "karo", "kardo", "please", "dost", "bhai",
  "hai", "he", "isko", "unko", "ise", "use",
]);
/** Longer than this and it is a sentence with an opinion in it, not an answer. */
const CONFIRM_MAX_WORDS = 4;

function readConfirmation(raw: string): "yes" | "no" | "unclear" {
  const words = raw
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 || words.length > CONFIRM_MAX_WORDS) return "unclear";
  if (words.some((w) => CONFIRM_NO.has(w))) return "no";
  if (!words.some((w) => CONFIRM_YES.has(w))) return "unclear";
  return words.every((w) => CONFIRM_YES.has(w) || CONFIRM_FILLER.has(w)) ? "yes" : "unclear";
}

const GENERAL_STARTERS = [
  { key: "grio.starterBio", tpl: "Achhi bio kaise likhun?" },
  { key: "grio.starterFirstTalk", tpl: "Pehli baat-cheet me kya poochun?" },
  { key: "grio.starterFamily", tpl: "Family ko kaise convince karun?" },
];

const SCOPED_STARTERS = [
  { key: "grio.starterFirstMessageTo", tpl: "{name} ko pehla message kya likhun?" },
  { key: "grio.starterIcebreaker", tpl: "Ek achha icebreaker line do" },
  { key: "grio.starterReplyHelp", tpl: "Inke last message ka reply likhne me madad karo" },
  { key: "grio.starterSweetLine", tpl: "Ek pyari line ya quote suggest karo" },
];

/**
 * Rishta Lens' starters. None of them asks Grio to decide, because a starter the
 * model must refuse teaches the user the feature is broken rather than that the
 * boundary is deliberate.
 *
 * Two of the four are now about *doing* rather than understanding, and that is
 * for a reason Phase H introduced: explanation is Premium, but acting on the
 * rishta and knowing what an action costs are not. A rail of four
 * explain-only starters would have handed a non-Premium user four upsells in a
 * row on a screen where they can, in fact, do most of what they came for.
 */
const CANDIDATE_STARTERS = [
  { key: "grio.starterHowIsThisMatch", tpl: "Ye rishta mere liye kaisa hai?" },
  { key: "grio.starterWhatIfInterest", tpl: "Interest bhejun to kya hoga?" },
  { key: "grio.starterWhatFits", tpl: "Kya cheezein match kar rahi hain?" },
  { key: "grio.starterFirstQuestionTo", tpl: "{name} se ek sawaal poochhna hai" },
];

/**
 * The rail above the composer — doc 11 §3.4.
 *
 * Fixed: same four, same order, every session, scoped or not. They deliberately
 * do not react to context, because a rail that reshuffles is a rail nobody
 * builds muscle memory for — the user's thumb should know where "My pending"
 * is before their eyes find it. Contextual suggestions already have a home:
 * the buttons Grio proposes inside a reply.
 *
 * Labels are English per the app's CTA convention; the question each one sends
 * is Hinglish, like the rest of the conversation.
 */
const SHORTCUTS: { label: string; ask: string }[] = [
  { label: "My pending", ask: "Mera abhi kya pending hai?" },
  { label: "Today's matches", ask: "Aaj ke rishtey kaise chal rahe hain?" },
  { label: "Write a message", ask: "Kisi ko message likhne me meri madad karo" },
  { label: "Improve profile", ask: "Meri profile me kya sudhaar kar sakta hoon?" },
];

/**
 * The chat engine, shared by the global overlay (components/grio/GrioOverlay)
 * and the standalone /user/concierge page. Scope (which match, if any, Grio
 * is helping message) lives in GrioProvider, not local state — so the in-chat
 * "Ask Grio" button and the picker both feed the same place.
 */
export default function GrioChatCore({
  compact = false,
  standalone = false,
}: {
  compact?: boolean;
  /**
   * True on the full-page `/user/concierge` entry, false inside the overlay.
   * The overlay stays mounted on every `/user/*` page even while closed, so
   * the deck uses this to tell "the user is looking at me" from "I exist" —
   * without it, every page load would fetch cards nobody is looking at.
   */
  standalone?: boolean;
}) {
  const t = useT();
  const { isOpen, scope, setScope, voiceEnabled, close } = useGrio();
  const voice = useGrioVoice(voiceEnabled);
  const { toast } = useToast();
  const router = useRouter();

  const [messages, setMessages] = useState<ConciergeMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ text: string; matchId: string; name: string } | null>(null);
  /**
   * The Ask Bridge half of the same shape as `pendingText`/`confirmState`:
   * `askAwaitingTarget` holds a drafted question with nobody chosen yet,
   * `askConfirm` holds one with a person attached and the editor open.
   */
  const [askAwaitingTarget, setAskAwaitingTarget] = useState<string | null>(null);
  const [askConfirm, setAskConfirm] = useState<{ text: string; target: GrioActionTargetRef } | null>(null);
  const [voiceTarget, setVoiceTarget] = useState<GrioActionTargetRef | null>(null);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  /**
   * The guided walk through today's reel. The whole list lives here on the
   * client; the model only ever receives `steps[index]` as scope, one at a
   * time. That split is the feature's safety argument — see the docstring on
   * `app/api/concierge/walkthrough/route.ts`.
   */
  const [walk, setWalk] = useState<{ steps: ConciergeWalkthroughStep[]; index: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /**
   * The conversation, readable synchronously.
   *
   * `messages` alone is not enough once a turn can trigger a second turn: a
   * `<<<WHO:n>>>` reply re-enters `ask` inside the same tick, and a `setState`
   * updater cannot be read back before React re-renders. Every mutation goes
   * through `commit`, which writes both — so the follow-up request carries the
   * turn that caused it instead of the conversation as it stood two messages
   * ago.
   */
  const messagesRef = useRef<ConciergeMessage[]>([]);
  /** The same in-flight guard as `sending`, readable inside that re-entrant call. */
  const sendingRef = useRef(false);
  /**
   * The numbered people the server showed the model on the last turn. This is
   * the *only* thing `<<<WHO:n>>>` is ever resolved against — see the field's
   * note in lib/contracts/concierge.ts for why a separately fetched list would
   * eventually open the wrong person's profile.
   */
  const rosterRef = useRef<ConciergeRosterEntry[]>([]);
  /**
   * One focus hop per user turn, and no more.
   *
   * The hop re-asks the same question with somebody in scope. Nothing stops the
   * scoped reply from pointing at a third person, and two markers in a row would
   * be an unbounded chain of paid calls the user never asked for. One hop is
   * enough for "sabse zyada matching wale ke baare me batao"; a second is the
   * model wandering.
   */
  const hopUsedRef = useRef(false);
  /**
   * Indices of replies whose `<<<DO:>>>` was already carried out.
   *
   * Needed because rendering happens from the stored reply text, which still
   * contains the marker after the action has run — without this the user would
   * be handed a "Send interest" chip immediately below the interest they just
   * sent. Indices are stable: `commit` only ever appends.
   */
  const ranRunRef = useRef<Set<number>>(new Set());
  /**
   * A spoken action waiting on "haan" or "na" — see the live-mode branch in
   * `runRequestedAction`. A ref rather than state because the answer is read
   * inside `ask`, which the voice loop can call in the same tick the
   * confirmation was set.
   */
  const pendingVoiceConfirmRef = useRef<{ key: GrioActionKey; target: GrioActionTargetRef } | null>(null);
  /** Fires the opening briefing once per mounted conversation, never per panel open. */
  const briefedRef = useRef(false);

  function commit(next: ConciergeMessage[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  useEffect(() => {
    // Not until the user has actually said something: with the deck at the top
    // of this scroller, jumping to the bottom would scroll the cards out of view
    // before they have been seen. The opening briefing is an assistant turn the
    // user did not ask for, so it must not trigger the jump either — it arrives
    // on open, when the deck is the thing worth looking at.
    if (!messages.some((m) => m.role === "user")) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Speech lands in the composer, and stops there — it is never auto-sent.
  // Hinglish transcription is good, not perfect, and the difference between
  // "reading back what I heard" and "sending what I think I heard" is the
  // difference between a mishearing the user fixes in two seconds and one they
  // watch Grio answer. `heard` is only non-empty while a recording is live, so
  // this cannot overwrite something typed between turns.
  useEffect(() => {
    if (voice.heard) setDraft(voice.heard.slice(0, 1000));
  }, [voice.heard]);

  /**
   * Live mode's other half: an utterance that finished goes straight out.
   *
   * Only fires in live mode — `finalTurn` is set nowhere else — so push-to-talk
   * keeps its read-before-send safeguard untouched. Cleared before `ask` rather
   * than after, so a send that throws cannot leave the turn queued to fire
   * again on the next render.
   */
  useEffect(() => {
    if (!voice.finalTurn) return;
    const { text } = voice.finalTurn;
    voice.clearFinalTurn();
    void ask(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.finalTurn]);

  /**
   * Grio speaks first.
   *
   * Fetched rather than composed here because every claim in it — how many
   * rishtey, whose names, what is waiting — is a database read, and a greeting
   * is the one message nobody double-checks (see
   * `lib/services/grio/briefing.ts`). No model is involved, so opening the panel
   * costs nothing.
   *
   * Once per mounted conversation, not once per open: the overlay stays mounted
   * across `/user/*` navigation, and re-greeting on every reopen would stack
   * identical paragraphs on top of a conversation already in progress.
   */
  useEffect(() => {
    if (!(standalone || isOpen)) return;
    if (briefedRef.current || messagesRef.current.length > 0) return;
    briefedRef.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/concierge/briefing");
        const json = (await res.json()) as ConciergeBriefingResponse;
        if (!res.ok || !json.ok || !json.text) return;
        // A message that arrived while the request was in flight wins — the user
        // typing beats a greeting, always.
        if (messagesRef.current.length > 0) return;
        commit([{ role: "assistant", content: json.text }]);
        // The names in the greeting are the handles for what the user says next
        // ("Priya ke baare me batao"), so the list has to be live before the
        // reply that uses it — not after the first chat turn.
        if (json.roster) rosterRef.current = json.roster;
        voice.speak(json.text);
      } catch {
        /* silent — the panel simply opens the way it always did */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone, isOpen]);

  /**
   * `scopeOverride` exists for the walkthrough, and for a reason worth naming:
   * `setScope` is a React state update, so a step that set the scope and then
   * called `ask` in the same tick would send the *previous* candidate's id and
   * ask Grio to introduce the wrong person. Passing the scope explicitly makes
   * the step atomic instead of relying on a render landing in between.
   */
  async function ask(
    text: string,
    scopeOverride?: GrioScope,
    /**
     * `silent` re-asks a question already on screen.
     *
     * The focus hop sends the user's own words a second time — now with the
     * person they meant in scope — and showing that twice would look like the
     * app had stuttered. The model still receives it as the trailing turn;
     * only the transcript on screen is spared the repeat.
     */
    opts?: { silent?: boolean },
  ) {
    const content = text.trim();
    if (!content || sendingRef.current) return;

    // A spoken confirmation is answered here, before anything is sent: "haan"
    // is not a question for the model, and paying for a turn to interpret it
    // would also make the pause long enough to feel like the app missed it.
    if (pendingVoiceConfirmRef.current) {
      const answer = readConfirmation(content);
      if (answer !== "unclear") {
        const { key, target } = pendingVoiceConfirmRef.current;
        pendingVoiceConfirmRef.current = null;
        commit([...messagesRef.current, { role: "user", content }]);
        setDraft("");
        if (answer === "no") {
          const line = t("grio.voiceConfirmNo", "Theek hai, nahi bheja.");
          appendOutcome(line);
          voice.speak(line);
          return;
        }
        await executeConfirmed(key, target);
        return;
      }
      // Anything else means they moved on — the action lapses rather than
      // waiting around to be answered by an unrelated sentence later.
      pendingVoiceConfirmRef.current = null;
    }

    const active = scopeOverride ?? scope;
    const silent = opts?.silent ?? false;
    setError(null);
    setDraft("");
    const next: ConciergeMessage[] = silent
      ? messagesRef.current
      : [...messagesRef.current, { role: "user", content }];
    commit(next);
    sendingRef.current = true;
    setSending(true);
    /**
     * In live mode the mic is reopened by the end of Grio *speaking* — so a
     * turn that never produces a reply (network drop, a 403 from a plan gate)
     * would hand the turn to nobody and silently end the session. This tracks
     * whether that hand-off happened, so the `finally` can do it instead.
     */
    let spoke = false;
    /** Set when the reply pointed at somebody — the same question, asked again with them in scope. */
    let hop: GrioScope | null = null;

    try {
      // On a silent re-ask the trailing turn is not in `next` (it is already on
      // screen from the first attempt), so it is appended to the payload alone.
      // The model must still see the question it is answering.
      const payload = silent ? [...next, { role: "user" as const, content }] : next;
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payload.slice(-12),
          ...(active?.kind === "match" ? { matchId: active.matchId } : {}),
          ...(active?.kind === "candidate" ? { candidateProfileId: active.profileId } : {}),
        }),
      });
      const json = (await res.json()) as ConciergeResponse;
      if (!res.ok || !json.ok || !json.reply) {
        setError(json.message ?? t("grio.noReply", "Jawab nahi mila — dobara try karein."));
        return;
      }
      const reply = json.reply;
      commit([...messagesRef.current, { role: "assistant", content: reply }]);
      // Replaced wholesale rather than merged: the server renumbers from scratch
      // each turn, so keeping any older row would mean two different people
      // answering to the same n.
      if (json.roster) rosterRef.current = json.roster;

      const segments = parseGrioSegments(reply);
      for (const seg of segments) {
        if (seg.type === "action" && GRIO_ACTIONS[seg.key].kind === "remember" && seg.arg) {
          void rememberFact(seg.arg);
        }
      }

      // `<<<DO:` — the user asked for it by name, so it runs here instead of
      // becoming a chip. Awaited rather than fired off, so the outcome line is
      // in the transcript before any hop re-asks and the model can see that the
      // thing it was asked to do is already done.
      //
      // The index is taken before running: `appendOutcome` pushes a further
      // message, so reading the length afterwards would mark the wrong reply.
      const replyIndex = messagesRef.current.length - 1;
      const ran = await runRequestedAction(segments, active);
      if (ran) ranRunRef.current.add(replyIndex);

      // A reply that *did* something has nothing left to look up. The hop exists
      // to fetch a person's dossier so Grio can talk about them; after "interest
      // bhej do" there is no follow-up question waiting on one, and re-asking
      // would spend a second paid call to answer a request that is already
      // finished.
      hop = ran ? null : resolveHop(segments, active);

      // A hop's ack ("Theek hai, Priya ko dekhte hain") is not read aloud, and
      // that is deliberate rather than an omission: in live mode the mic reopens
      // when Grio *stops* speaking, so speaking here would hand the turn back to
      // the user in the half-second before the real answer arrives.
      if (!hop) {
        // No-op unless the user turned "speak replies" on; markers are stripped
        // inside `speak`, never read aloud.
        voice.speak(reply);
        spoke = true;
      }
    } catch {
      setError(t("grio.networkErrorDot", "Network error — dobara try karein."));
    } finally {
      sendingRef.current = false;
      setSending(false);

      if (hop) {
        hopUsedRef.current = true;
        setScope(hop);
        // Same words, now with somebody in scope — so the answer comes back with
        // the dossier the first call had no way to load.
        void ask(content, hop, { silent: true });
      } else {
        hopUsedRef.current = false;
        // The failed-turn hand-off: nothing was spoken, so nothing will reopen
        // the mic. Without this a single failed request ends a hands-free
        // session with no sound and no visible reason.
        if (voice.live && !spoke) voice.startListening();
      }
    }
  }

  /** Carries out an action the user has just confirmed out loud. */
  async function executeConfirmed(key: GrioActionKey, target: GrioActionTargetRef) {
    const spec = GRIO_ACTIONS[key] as GrioActionSpec;
    if (spec.kind === "sheet" && spec.sheet) {
      handleOpenSheet(spec.sheet, target);
      return;
    }
    const result = await runGrioAction(key, target.profileId);
    if (!result.ok) {
      const line = result.message ?? t("grio.tryAgain", "Dobara try karein.");
      toast({ title: t("grio.actionFailed", "Nahi ho paya"), description: line, tone: "error" });
      // Spoken as well as toasted: in live mode the user is not necessarily
      // looking at the screen, and a refusal they never hear reads as success.
      appendOutcome(line);
      voice.speak(line);
      return;
    }
    toast({ title: result.done ?? t("grio.actionDone", "Ho gaya ✓"), tone: "success" });
    if (result.outcome) {
      appendOutcome(result.outcome);
      voice.speak(result.outcome);
    }
  }

  /**
   * Runs the one `<<<DO:>>>` a reply may carry. Returns whether anything ran.
   *
   * ## Where the target comes from
   *
   * The same two places it has always come from — the profile already open, or
   * an ordinal resolved against *this turn's* roster — and nowhere else. A
   * targeted action whose person cannot be resolved that way does **not** run;
   * it falls through to the chip path, where `GrioPersonPicker` asks. That
   * fallback is the whole reason auto-running is safe to offer: the failure mode
   * of "I could not tell who you meant" is a question, never a guess, and an
   * interest sent to the wrong person is only withdrawable for a day.
   *
   * ## One per reply
   *
   * `find`, not `filter`. Two spoken actions in one breath ("interest bhej do
   * aur shortlist bhi kar do") is a reasonable sentence and an unreasonable
   * thing to execute unattended — the second one is the one the user did not
   * watch happen. The rest of the reply's markers still render as chips.
   */
  async function runRequestedAction(
    segments: ReturnType<typeof parseGrioSegments>,
    active: GrioScope | null,
  ): Promise<boolean> {
    const req = segments.find((s): s is Extract<typeof s, { type: "run" }> => s.type === "run");
    if (!req) return false;

    // Widened like every other read of the catalog here: each row's literal
    // type only carries the optional fields it actually sets.
    const spec = GRIO_ACTIONS[req.key] as GrioActionSpec;

    // `remember` is saved straight from its own marker and has no endpoint; a
    // `<<<DO:remember:...>>>` would otherwise fall through to a POST to nothing.
    if (spec.kind === "remember") {
      if (req.arg) void rememberFact(req.arg);
      return true;
    }

    if (spec.kind === "nav" && spec.href) {
      close();
      router.push(spec.href);
      return true;
    }

    let target: { profileId: string; name: string } | null =
      active?.kind === "candidate" ? { profileId: active.profileId, name: active.name } : null;
    if (!target) {
      const who = segments.find((s): s is Extract<typeof s, { type: "who" }> => s.type === "who");
      const person = who ? rosterRef.current.find((r) => r.n === who.n) : undefined;
      if (person) target = { profileId: person.profileId, name: person.name };
    }

    // Unresolvable target → let the chip and its picker handle it.
    if (spec.needs && !target) return false;

    /*
     * Hands-free only: say who it is about to reach, and wait for a word back.
     *
     * The typed path runs a `<<<DO:>>>` outright, which is what was asked for and
     * is safe *because typing is exact* — a user who wrote "Priya" produced the
     * name themselves. Speech does not have that property. STT is at its least
     * reliable on proper nouns, and the roster is full of names one phoneme
     * apart; "Priya", "Riya" and "Diya" are the same utterance to a recogniser
     * having a bad moment. So in live mode the identity is the part that was
     * guessed, and the confirmation is spoken back precisely because it names
     * the person out loud — the user hears the mistake before it costs a monthly
     * quota slot and a 24-hour withdrawal window.
     *
     * Only targeted actions. A nav or a self-scoped `do` reaches nobody, and
     * confirming those would train the user to say "haan" without listening,
     * which is how a confirmation stops being one.
     */
    if (spec.needs && target && voice.live) {
      pendingVoiceConfirmRef.current = { key: req.key, target };
      const line = t("grio.voiceConfirm", "{name} ko bhej raha hoon — haan ya na?").replace(
        "{name}",
        target.name,
      );
      appendOutcome(line);
      voice.speak(line);
      return true;
    }

    // The recorder *is* the action for these: there is no audio to send until
    // the user speaks, so "do it now" can only mean "open it now".
    if (spec.kind === "sheet" && spec.sheet) {
      handleOpenSheet(spec.sheet, target);
      return true;
    }

    const result = await runGrioAction(req.key, target?.profileId ?? null);
    if (!result.ok) {
      toast({
        title: t("grio.actionFailed", "Nahi ho paya"),
        description: result.message ?? t("grio.tryAgain", "Dobara try karein."),
        tone: "error",
      });
      // Reported, not retried, and not converted into a chip — the endpoint
      // refused (quota, gate, already sent), and offering a button that posts
      // to the same endpoint would only fail again with an extra tap.
      return true;
    }

    toast({ title: result.done ?? t("grio.actionDone", "Ho gaya ✓"), tone: "success" });
    if (result.outcome) appendOutcome(result.outcome);
    return true;
  }

  /**
   * Turns a `<<<WHO:n>>>` into a person, or into nothing.
   *
   * Four ways it declines, and each is a real case rather than defensive
   * padding: the hop budget is spent, the reply carried no marker, the number
   * matches nobody on the roster (a hallucinated ordinal), or it names the
   * person already in scope — which would re-ask the same question forever.
   */
  function resolveHop(
    segments: ReturnType<typeof parseGrioSegments>,
    active: GrioScope | null,
  ): GrioScope | null {
    if (hopUsedRef.current) return null;
    const who = segments.find((s): s is Extract<typeof s, { type: "who" }> => s.type === "who");
    if (!who) return null;
    const person = rosterRef.current.find((r) => r.n === who.n);
    if (!person) return null;
    if (active?.kind === "candidate" && active.profileId === person.profileId) return null;
    return { kind: "candidate", profileId: person.profileId, name: person.name };
  }

  /**
   * `remember` is the one action kind that never becomes a chip — see the
   * "confirm gate" note in lib/contracts/grio.ts. The model only offers it for
   * something the user just typed themselves, so this fires the moment the
   * reply lands: no tap, just a toast the user can undo from the Memory panel.
   */
  async function rememberFact(fact: string) {
    try {
      const res = await fetch("/api/grio/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact }),
      });
      const json = await res.json().catch(() => ({}) as { ok?: boolean });
      // A full memory list or a network hiccup here is not worth interrupting
      // the conversation over — the user never asked for this save, so a
      // failure should be as invisible as the success almost is.
      if (!res.ok || json.ok === false) return;
      toast({ title: t("grio.willRemember", "Grio ne yaad rakh liya ✓"), description: fact, tone: "success" });
    } catch {
      /* silent — see above */
    }
  }

  async function sendToMatch(text: string, matchId: string, name: string) {
    try {
      const res = await fetch(`/api/messages/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({
          title: t("grio.sendFailed", "Bhej nahi paye"),
          description: json.message ?? t("grio.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }
      toast({
        title: `${t("grio.sentTo", "Bhej diya {name} ko").replace("{name}", name)} ✓`,
        tone: "success",
        action: { label: "Open Chat", onClick: () => router.push(`/user/messages/${matchId}`) },
      });
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
    }
  }

  /**
   * What just happened, written into the conversation by code.
   *
   * An assistant turn rather than a toast-only side effect, because the
   * transcript is exactly what gets resent to the model next turn. Without this
   * Grio keeps offering a button the user already pressed and answers "to ab
   * kya?" as though nothing had. The wording comes from the action catalog, so
   * this is still code speaking in Grio's voice — never the model narrating its
   * own success.
   */
  function appendOutcome(line: string) {
    commit([...messagesRef.current, { role: "assistant", content: line }]);
  }

  function handleOpenSheet(sheet: GrioActionSheet, target: GrioActionTargetRef | null) {
    if (sheet === "voiceNote") {
      // `needs: "profile"` means the chip already resolved somebody; a missing
      // target here would be a bug, and opening a recorder aimed at nobody is
      // the one outcome worth refusing outright.
      if (target) setVoiceTarget(target);
      return;
    }
    if (sheet === "todayPoll") {
      setPollOpen(true);
      return;
    }
    setAnswerOpen(true);
  }

  // ── the guided walk through today's rishtey ───────────────────────────────

  function openStep(steps: ConciergeWalkthroughStep[], index: number) {
    const step = steps[index];
    const stepScope: GrioScope = { kind: "candidate", profileId: step.profileId, name: step.name };
    setScope(stepScope);
    setWalk({ steps, index });
    // Code's question, asked on the user's behalf. It stays identical at every
    // stop so the walk has a rhythm — and so the model is never nudged toward
    // comparing this rishta with the last one by a prompt that mentions it.
    void ask(
      t("grio.walkAsk", "Is rishtey ko 3-4 line me bataiye, phir mujhe agla kadam sujhaiye."),
      stepScope,
    );
  }

  async function startWalkthrough() {
    if (sending) return;
    try {
      const res = await fetch("/api/concierge/walkthrough");
      const json = await res.json();
      const steps: ConciergeWalkthroughStep[] = json?.steps ?? [];
      if (steps.length === 0) {
        // Not an error state: a finished reel is the normal end of a good day.
        appendOutcome(
          t("grio.walkNothingLeft", "✓ Aaj ke saare rishtey dekh liye — kal naye aayenge."),
        );
        return;
      }
      openStep(steps, 0);
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
    }
  }

  function nextStep() {
    if (!walk) return;
    const next = walk.index + 1;
    if (next >= walk.steps.length) {
      endWalkthrough();
      appendOutcome(t("grio.walkDone", "✓ Aaj ke saare rishtey dekh liye."));
      return;
    }
    openStep(walk.steps, next);
  }

  function endWalkthrough() {
    setWalk(null);
    setScope(null);
  }

  /** Same two-step as `handleSendClick`: person from scope, or from the picker. */
  function handleAskClick(text: string) {
    if (scope?.kind === "candidate") {
      setAskConfirm({ text, target: { profileId: scope.profileId, name: scope.name } });
      return;
    }
    setAskAwaitingTarget(text);
  }

  async function sendQuestion(text: string, target: GrioActionTargetRef) {
    try {
      const res = await fetch("/api/profile-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: target.profileId, questionText: text }),
      });
      const json = (await res.json()) as AskQuestionResponse;
      if (!res.ok || !json.ok) {
        toast({
          title: t("grio.questionFailed", "Sawaal nahi bheja ja saka"),
          description: json.message ?? t("grio.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }
      // The service treats a repeat as a no-op rather than an error — one
      // question per person, ever. Reporting that as success would tell the
      // user they had just sent something they had not.
      if (json.alreadyAsked) {
        toast({
          title: t("grio.alreadyAsked", "Aap inse pehle hi ek sawaal poochh chuke hain"),
          description: t("grio.oneQuestionOnly", "Ek insaan se sirf ek hi sawaal poochha ja sakta hai."),
          tone: "info",
        });
        return;
      }
      toast({
        title: json.heldForReview
          ? t("grio.questionUnderReview", "Sawaal review me hai")
          : t("grio.questionSent", "Sawaal bhej diya"),
        tone: json.heldForReview ? "info" : "success",
      });
      appendOutcome(
        json.heldForReview
          ? t("grio.outcomeQuestionHeld", "✓ Sawaal bhej diya gaya hai — check hote hi unhe pahunch jayega.")
          : t(
              "grio.outcomeQuestionSent",
              "✓ Sawaal bhej diya gaya hai. Jab tak wo jawab na dein, unhe aapka naam nahi dikhega.",
            ),
      );
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
    }
  }

  function handleSendClick(text: string) {
    // Only a `match` scope has a thread to send into. In `candidate` scope the
    // route never offers <<<SEND>>> in the first place, so this falls through
    // to the picker — the same path an unscoped conversation takes.
    if (scope?.kind === "match") {
      setConfirmState({ text, matchId: scope.matchId, name: scope.name });
      return;
    }
    setPendingText(text);
    setPickerOpen(true);
  }

  function handlePick(match: ConciergeMatchOption) {
    setScope({ kind: "match", matchId: match.matchId, name: match.name });
    setPickerOpen(false);
    if (pendingText) {
      setConfirmState({ text: pendingText, matchId: match.matchId, name: match.name });
      setPendingText(null);
    }
  }

  function handleConfirmSend(finalText: string) {
    if (!confirmState) return;
    void sendToMatch(finalText, confirmState.matchId, confirmState.name);
    setConfirmState(null);
  }

  const starterDefs = !scope
    ? GENERAL_STARTERS
    : scope.kind === "match"
      ? SCOPED_STARTERS
      : CANDIDATE_STARTERS;
  // `ask` stays the Hinglish the model has always received; only the chip's
  // label follows the reader's language.
  const starters = starterDefs.map((s) => ({
    key: s.key,
    ask: s.tpl.replace("{name}", scope?.name ?? ""),
    label: t(s.key, s.tpl).replace("{name}", scope?.name ?? ""),
  }));

  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col", compact ? "" : "")}>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5 sm:px-6">
        {scope ? (
          // `min-w-0` + `truncate`, with the control group beside it marked
          // `shrink-0`, so all the shrinking lands here: a two-word name used to
          // wrap this pill onto three lines and stack the buttons. No `max-w` —
          // the chip should keep whatever room the row actually has and cut only
          // when it genuinely runs out.
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 py-1 pl-3 pr-1.5 text-[0.75rem] font-medium text-gold-700 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300">
            <span className="truncate">
              {scope.kind === "match"
                ? `💬 ${t("grio.scopeForMatch", "{name} ke liye").replace("{name}", scope.name)}`
                : `🔍 ${t("grio.scopeOnProfile", "{name} ki profile par").replace("{name}", scope.name)}`}
            </span>
            <button
              type="button"
              onClick={() => setScope(null)}
              aria-label={t("grio.clearScope", "Scope hataayein")}
              className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-gold-200/60 dark:hover:bg-gold-800/40"
            >
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-full border border-line px-3 py-1 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink"
          >
            + {t("grio.pickRecipient", "Kisi ko bhejna hai?")}
          </button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Hands-free. Distinct from "Speak" on purpose: Speak only reads
              replies aloud, Live also reopens the mic and sends what it hears
              without showing it first. Two different promises, two controls. */}
          {voiceEnabled && voice.supported && (
            <button
              type="button"
              onClick={voice.live ? voice.stopLive : voice.startLive}
              aria-pressed={voice.live}
              aria-label={
                voice.live
                  ? t("grio.stopLive", "Live baat-cheet band karein")
                  : t("grio.startLive", "Live baat-cheet shuru karein")
              }
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[0.75rem] transition-colors",
                voice.live
                  ? "border-wine-400 bg-wine-50 text-wine-700 dark:border-wine-600 dark:bg-wine-900/30 dark:text-wine-200"
                  : "border-line text-muted hover:border-gold-400 hover:text-ink",
              )}
            >
              <Radio className={cn("size-3.5", voice.live && "animate-pulse")} />
              {voice.live ? "Live" : "Go live"}
            </button>
          )}
          {voiceEnabled && voice.supported && !voice.live && (
            <button
              type="button"
              onClick={voice.toggleSpeakReplies}
              aria-pressed={voice.speakReplies}
              aria-label={
                voice.speakReplies
                  ? t("grio.stopSpeaking", "Jawab bolna band karein")
                  : t("grio.speakReplies", "Jawab bol kar sunaayein")
              }
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[0.75rem] transition-colors",
                voice.speakReplies
                  ? "border-gold-300 bg-gold-50 text-gold-700 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300"
                  : "border-line text-muted hover:border-gold-400 hover:text-ink",
              )}
            >
              {voice.speakReplies ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              {/* Label drops on narrow panels so the scope chip keeps enough
                  room to say whose profile this is. Four labelled controls plus
                  a name do not fit beside each other on a phone, and of the
                  five the name is the one that carries information. */}
              <span className="hidden md:inline">Speak</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setMemoryOpen(true)}
            aria-label="What Grio Remembers"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3 py-1 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink"
          >
            <BrainCircuit className="size-3.5" />
            <span className="hidden md:inline">Memory</span>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
        {/* Above the conversation and inside the same scroller: the first thing
            on open, and out of the way once there is a conversation to read. */}
        <GrioDeck standalone={standalone} />

        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-wine-100 text-wine-700 dark:bg-wine-900/50 dark:text-wine-300">
              <Sparkles className="size-5" />
            </span>
            <p className="max-w-xs text-[0.8125rem] text-muted">
              {!scope
                ? t(
                    "grio.introGeneral",
                    "Rishtey ke safar me general guidance ke liye poochiye — kisi specific profile ke baare me nahi, wo faisla hamesha aapka apna hai.",
                  )
                : scope.kind === "match"
                  ? t(
                      "grio.introMatch",
                      "{name} ke saath rishtey me madad ke liye poochiye — icebreaker, reply, ya kuch aur.",
                    ).replace("{name}", scope.name)
                  : t(
                      "grio.introCandidate",
                      "{name} ki profile par jo hisaab lagaa hai, wo samajhne ke liye poochiye. Grio samjhaata hai — faisla aapka hi rahega.",
                    ).replace("{name}", scope.name)}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {starters.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => ask(s.ask)}
                  className="rounded-full border border-line px-3 py-1.5 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink"
                >
                  {s.label}
                </button>
              ))}
            </div>

            {!scope && (
              <Link
                href="/user/biodata"
                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 px-3 py-1.5 text-[0.75rem] font-medium text-gold-700 transition-colors hover:border-gold-500 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300"
              >
                <FileText className="size-3.5" />
                Create Biodata for Parents
              </Link>
            )}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-gradient-to-b from-gold-400 to-gold-600 px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-primary-fg">
                  {m.content}
                </div>
              </div>
            );
          }
          const segments = parseGrioSegments(m.content);
          // Actions are collected and rendered as one row under the reply
          // rather than inline where the marker happened to land. The model
          // controls *which* buttons appear, never where they sit — a chip
          // wedged mid-sentence reads as part of the sentence.
          //
          // A `run` segment joins them only when it did *not* run — the
          // unresolved-target case, where the chip's picker is exactly the
          // "who did you mean?" this path refuses to answer by guessing. One
          // that did run is dropped: its work is done and its outcome is
          // already a message below.
          const ranHere = ranRunRef.current.has(i);
          const actions: GrioActionRequest[] = segments
            .filter(
              (seg): seg is Extract<typeof seg, { type: "action" | "run" }> =>
                (seg.type === "action" || (seg.type === "run" && !ranHere)) &&
                GRIO_ACTIONS[seg.key].kind !== "remember",
            )
            .map(({ key, arg }) => ({ key, arg }));

          return (
            <div key={i} className="flex flex-col items-start gap-2">
              {segments.map((seg, j) =>
                seg.type === "send" ? (
                  <SuggestedMessageCard
                    key={j}
                    text={seg.value}
                    recipientName={scope?.name ?? null}
                    onSend={handleSendClick}
                  />
                ) : seg.type === "ask" ? (
                  <SuggestedMessageCard
                    key={j}
                    text={seg.value}
                    recipientName={scope?.kind === "candidate" ? scope.name : null}
                    heading={t("grio.suggestedQuestion", "Suggested question")}
                    sendLabel="Ask this"
                    onSend={handleAskClick}
                  />
                ) : seg.type === "text" ? (
                  <div
                    key={j}
                    className="max-w-[85%] rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-ink"
                  >
                    {seg.value}
                  </div>
                ) : null,
              )}
              <GrioActionChips
                actions={actions}
                onOpenSheet={handleOpenSheet}
                onOutcome={appendOutcome}
              />
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              <span className="text-[0.8125rem]">{t("grio.thinking", "Soch rahe hain…")}</span>
            </div>
          </div>
        )}

        {error && <p className="text-center text-[0.75rem] text-danger">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-line bg-surface">
        {/* The walk's own controls, above the generic rail: while a walk is
            running these are the only two things most users want, and burying
            "Next" inside a scrolling rail would make the rhythm work against
            the thumb. */}
        {walk && (
          <div className="flex items-center gap-2 border-b border-line px-4 py-2 sm:px-6">
            <span className="truncate text-[0.75rem] text-muted">
              {walk.index + 1} / {walk.steps.length} · {walk.steps[walk.index].name}
            </span>
            <div className="ml-auto flex shrink-0 gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={nextStep}
                className="rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-[0.75rem] font-medium text-gold-700 transition-colors hover:border-gold-500 disabled:opacity-50 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300"
              >
                {walk.index + 1 >= walk.steps.length ? "Finish" : "Next rishta"}
              </button>
              <button
                type="button"
                onClick={endWalkthrough}
                className="rounded-full border border-line px-3 py-1 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink"
              >
                Stop
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto px-4 pt-2.5 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
          {!walk && (
            <button
              type="button"
              disabled={sending}
              onClick={startWalkthrough}
              className="shrink-0 rounded-full border border-gold-300 bg-gold-50 px-3 py-1.5 text-[0.75rem] font-medium text-gold-700 transition-colors hover:border-gold-500 disabled:opacity-50 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300"
            >
              Walk me through today
            </button>
          )}
          {SHORTCUTS.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={sending}
              onClick={() => ask(s.ask)}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[0.75rem] text-muted transition-colors hover:border-gold-400 hover:text-ink disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-end gap-2 bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(draft);
            }
          }}
          placeholder={t("grio.composerPlaceholder", "Apna sawaal likhein…")}
          rows={1}
          disabled={sending}
          className="max-h-32 flex-1 resize-none rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]"
        />
        {voiceEnabled && voice.supported && !voice.live && (
          <Button
            size="icon"
            variant={voice.listening ? "accent" : "secondary"}
            disabled={sending}
            onClick={() => (voice.listening ? voice.stopListening() : voice.startListening())}
            ariaLabel={
              voice.listening
                ? t("grio.stopListening", "Sunna band karein")
                : t("grio.askByVoice", "Bol kar poochiye")
            }
          >
            {voice.listening ? <Square className="size-4" /> : <Mic className="size-4" />}
          </Button>
        )}
        {/* In live mode the mic button becomes a single, unmissable Stop. Two
            controls — one to end the session, one to end this utterance — would
            be two ways to get it wrong while the mic is open. */}
        {voiceEnabled && voice.supported && voice.live && (
          <Button
            size="icon"
            variant="accent"
            onClick={voice.stopLive}
            ariaLabel={t("grio.stopLive", "Live baat-cheet band karein")}
          >
            <Square className="size-4" />
          </Button>
        )}
        <Button size="icon" disabled={!draft.trim() || sending} onClick={() => ask(draft)} ariaLabel="Send">
          <Send className="size-4" />
        </Button>
      </div>

      {voice.micError && (
        <p className="-mt-1 px-4 pb-2 text-[0.75rem] text-danger sm:px-6">{voice.micError}</p>
      )}

      <GrioMemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <GrioMatchPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePick} />
      <GrioSendConfirm
        open={confirmState !== null}
        recipientName={confirmState?.name ?? null}
        initialText={confirmState?.text ?? ""}
        onCancel={() => setConfirmState(null)}
        onConfirm={handleConfirmSend}
      />

      {/* Mounted only while a question is waiting on a person — see the same
          pattern in GrioActionChips. */}
      {askAwaitingTarget !== null && (
        <GrioPersonPicker
          open
          onClose={() => setAskAwaitingTarget(null)}
          onPick={(person) => {
            setAskConfirm({
              text: askAwaitingTarget,
              target: { profileId: person.profileId, name: person.name },
            });
            setAskAwaitingTarget(null);
          }}
        />
      )}

      <GrioSendConfirm
        open={askConfirm !== null}
        recipientName={askConfirm?.target.name ?? null}
        initialText={askConfirm?.text ?? ""}
        title={
          askConfirm
            ? t("grio.askConfirmTitle", "{name} se sawaal poochein").replace("{name}", askConfirm.target.name)
            : undefined
        }
        note={t(
          "grio.askConfirmNote",
          "Ek insaan se zindagi me sirf ek hi sawaal poochha ja sakta hai — bhejne se pehle padh lijiye.",
        )}
        maxLength={QUESTION_MAX_LENGTH}
        onCancel={() => setAskConfirm(null)}
        onConfirm={(finalText) => {
          if (askConfirm) void sendQuestion(finalText, askConfirm.target);
          setAskConfirm(null);
        }}
      />

      <GrioVoiceNoteSheet
        target={voiceTarget}
        onClose={() => setVoiceTarget(null)}
        onSent={() => {
          setVoiceTarget(null);
          appendOutcome(`✓ ${GRIO_ACTIONS.sendVoiceNote.outcome}`);
        }}
      />

      <GrioAnswerSheet
        open={answerOpen}
        onClose={() => setAnswerOpen(false)}
        onAnswered={() => appendOutcome(`✓ ${GRIO_ACTIONS.answerPendingQuestion.outcome}`)}
      />

      <GrioPollSheet
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        onVoted={() => appendOutcome(`✓ ${GRIO_ACTIONS.answerTodayPoll.outcome}`)}
      />
    </div>
  );
}
