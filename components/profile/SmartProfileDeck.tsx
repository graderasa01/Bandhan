"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronLeft, Hand, Lock, PenLine,
  RefreshCw, Sparkles, X,
} from "lucide-react";
import { PROFILE_FIELDS, questionFor, type ProfileFieldDef } from "@/lib/profile/fields";
import { categoryOf } from "@/lib/profile/fieldGroups";
import { CATEGORY_ICON } from "@/components/profile/categoryIcons";
import { isAnswered, missingRequired, type ProfileValues } from "@/lib/profile/stages";
import { useProfile } from "@/lib/profile/profileState";
import {
  COMPOSE_CARDS, POPULAR_CITIES, SAME_AS_PREFIX, communitiesFor, composeAboutMe,
  pathToValue, quickSpecFor, type QuickEscape, type QuickNode, type QuickSpec,
} from "@/lib/profile/quickPicks";
import { cn } from "@/lib/utils";
import { ease, haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import InfoTip from "@/components/ui/InfoTip";
import PhotoUploadCard from "@/components/profile/PhotoUploadCard";
import ManualCard, { type ManualCardDirection } from "@/components/profile/ManualCard";
import {
  ChipGrid, Crumbs, DateWheel, HeightWheel, PlacePicker, QuickIcon, Stepper, TimeWheel,
} from "@/components/profile/quickInputs";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The Smart Profile Deck — tap, confirm, live.
 *
 * The same wedding-card deck (`ManualCard` physics, the `.deck` skin), with
 * one thing changed and everything else following from it: **an answer is a
 * tap, and a tap moves you on.** No keyboard for the ninety per cent of the
 * catalog that is a closed set of answers, no Next button to reach for after
 * every chip, no card that asks three questions and waits.
 *
 * Four ideas carry it:
 *
 * 1. **One question per card.** The old deck packed up to three compact
 *    fields per page to keep the card count down. With auto-advance that
 *    trade reverses: three questions on a card cost a scan, a decision about
 *    where to start, and a Next tap; one question costs a glance and a tap.
 *    The only exception is the handful of genuinely paired questions below
 *    (`PAIRS`), where the second is a footnote to the first.
 *
 * 2. **A cascade is still one card.** "Job → IT / Software → Software
 *    Engineer" morphs in place: same card, same progress count, breadcrumbs
 *    to rewind. Three taps produce a job title nobody had to spell, and the
 *    deck never grew.
 *
 * 3. **Every tap saves.** There is no submit. `setValue` fires on the tap
 *    that answers, and `ProfileProvider`'s debounced sync does the rest.
 *
 * 4. **The outs are as visible as the answers.** "Don't know", "Prefer not to
 *    say" and "Not listed" sit under every card that can honestly offer them.
 *    A controlled list without an escape does not produce clean data — it
 *    produces a confident wrong answer from whoever could not find theirs.
 *
 * ## Why the values are still words, not codes
 *
 * See the header of `lib/profile/quickPicks.ts`. In short: this app already
 * separates the stored string from the displayed one through the i18n layer,
 * so the value a chip stores is the app's own canonical word and every
 * existing filter, score and export keeps working untouched.
 *
 * ## What this does not replace
 *
 * `ManualProfileFormMobile` stays, and stays reachable: it is the full-form
 * fallback, and it is still what the voice interview swipes into (its
 * `leadCard` seam). This deck is the default way in.
 */

/** Current card + this many peeking behind it — same stack as the old deck. */
const STACK_DEPTH = 3;

/** How long a chosen chip is allowed to look chosen before the card moves. */
const ADVANCE_MS = 260;

const HINT_SEEN_KEY = "smart-deck-hint-seen";
const HINT_DURATION_MS = 5000;

/**
 * The only fields that share a card.
 *
 * Both halves must be plain single-select chip questions, and the second has
 * to read as a follow-up to the first — "aur drinking?" after smoking. Pairing
 * anything heavier (a cascade, a wheel, a twelve-chip grid) puts two scrolls
 * on one card and undoes the reason the deck is one question deep.
 */
const PAIRS: readonly (readonly [string, string])[] = [
  ["smoking", "drinking"],
  ["familyType", "familyValues"],
  ["siblings", "siblingsMarried"],
];

function iconFor(field: ProfileFieldDef) {
  return CATEGORY_ICON[categoryOf(field.key)];
}

/** The gold flourish, same mark the old deck uses between questions. */
function Ornament({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 12" className={className} aria-hidden focusable="false">
      <path d="M12 1.5 15.5 6 12 10.5 8.5 6z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="3" cy="6" r="1" fill="currentColor" />
      <circle cx="21" cy="6" r="1" fill="currentColor" />
    </svg>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/**
 * Which fields this deck covers, decided once on mount.
 *
 * Frozen for the same reason the old deck freezes it: with `pendingOnly`, a
 * field stops being pending the instant it is answered, and recomputing would
 * delete the card out from under the finger that just answered it — which,
 * with auto-advance, would happen on literally every tap.
 */
function selectDeckFields(
  values: ProfileValues,
  opts: { only?: readonly string[] | null; pendingOnly?: boolean; focusKey?: string | null },
): ProfileFieldDef[] {
  const allow = opts.only ? new Set(opts.only) : null;
  const picked = PROFILE_FIELDS.filter((f) => {
    if (allow && !allow.has(f.key)) return false;
    if (f.key === opts.focusKey) return true;
    // Photos never appear in draft values, so `isAnswered` reads them as
    // pending forever — they would pin themselves to every filtered deck.
    if (opts.pendingOnly && (f.type === "photo" || isAnswered(f, values))) return false;
    return true;
  });
  return picked.length > 0 ? picked : PROFILE_FIELDS.filter((f) => (allow ? allow.has(f.key) : true));
}

/** One card per field, except the three pairs above. */
function buildCards(fields: ProfileFieldDef[]): ProfileFieldDef[][] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const used = new Set<string>();
  const cards: ProfileFieldDef[][] = [];

  for (const field of fields) {
    if (used.has(field.key)) continue;
    used.add(field.key);
    const pair = PAIRS.find(([a]) => a === field.key);
    const mate = pair ? byKey.get(pair[1]) : undefined;
    if (mate && !used.has(mate.key)) {
      used.add(mate.key);
      cards.push([field, mate]);
    } else {
      cards.push([field]);
    }
  }
  return cards;
}

/* ================================================================== */
/* One field's tap UI                                                  */
/* ================================================================== */

/**
 * `@fieldKey` shortcuts ("Same as my city") resolve against the live draft
 * here, at the one place that has it.
 */
function resolveShortcut(raw: string, values: ProfileValues): string | null {
  if (!raw.startsWith(SAME_AS_PREFIX)) return raw;
  const key = raw.slice(SAME_AS_PREFIX.length);
  return values[key]?.trim() || null;
}

/**
 * Chips for a field whose options depend on another answer. Today that is
 * community, which follows religion — see `dynamic` in quickPicks.ts.
 */
function dynamicNodes(spec: QuickSpec, values: ProfileValues): QuickNode[] {
  const input = spec.input;
  if (input.kind !== "chips" || !input.dynamic) return input.kind === "chips" ? input.nodes : [];
  return [...input.nodes, ...communitiesFor(values.religion).map((label) => ({ label }))];
}

function QuickField({
  field,
  forSelf,
  onAnswered,
  soleFieldOnCard,
}: {
  field: ProfileFieldDef;
  forSelf: boolean;
  /** Fired the moment this field holds a real answer. The card decides
   *  whether that is enough to move on. */
  onAnswered: () => void;
  /** Pairs never show a full-width CTA — see `PAIRS`. */
  soleFieldOnCard: boolean;
}) {
  const t = useT();
  const { draft, setValue, clearField, skipField } = useProfile();
  const spec = quickSpecFor(field.key);
  /**
   * Narrowed on a local const, not read as `spec.input.kind` at each use.
   * TypeScript keeps a const's narrowing inside the arrow functions below
   * (the CTA handlers), where a property access would have widened straight
   * back to the full union.
   */
  const input = spec?.input ?? null;
  const value = draft.values[field.key] ?? "";
  const answered = isAnswered(field, draft.values);

  /** Where we are inside a cascade. Restored from the saved value on mount. */
  const [path, setPath] = useState<QuickNode[]>(() => {
    if (!value || !spec || spec.input.kind !== "chips") return [];
    const full = pathToValue(spec.input.nodes, value);
    return full ? full.slice(0, -1) : [];
  });
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");

  function commit(next: string) {
    if (next.trim().length === 0) {
      clearField(field.key);
      return;
    }
    setValue(field.key, next, { source: "user", confirmed: true });
  }

  /** Answer and move — the deck's whole point, in one place. */
  function answer(next: string) {
    commit(next);
    onAnswered();
  }

  function escape(esc: QuickEscape) {
    haptic("tap");
    if (esc.value) {
      answer(esc.value);
      return;
    }
    // Nothing stored. A required field cannot be permanently skipped (see
    // `queue` in stages.ts, which ignores `skipped` for required fields), so
    // this is only ever "not right now" there — and the deck still moves on,
    // because standing on a card the user has declined twice helps nobody.
    clearField(field.key);
    skipField(field.key);
    onAnswered();
  }

  const Icon = iconFor(field);
  const multi = field.type === "multiselect";
  const picked = multi ? value.split(",").map((s) => s.trim()).filter(Boolean) : value ? [value] : [];

  /* ---------------- the input itself ---------------- */

  let control: React.ReactNode = null;
  let cta: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  if (field.type === "photo") {
    control = (
      <div className="mt-5 space-y-2 text-left">
        <PhotoUploadCard />
        <p className="text-[0.75rem] leading-snug text-muted">
          {t(
            "profile.smartDeck.photoOptionalNote",
            "Photo zaroori nahi hai — iske bina bhi profile live ho jayegi. Par jinhe aap dikhna chahte hain, unke liye ek saaf photo sabse bada farq daalti hai.",
          )}
        </p>
      </div>
    );
  } else if (input?.kind === "compose") {
    control = <AboutMeComposer field={field} forSelf={forSelf} onDone={answer} />;
  } else if (input?.kind === "place") {
    // A "Same as my city" shortcut is only offered once there *is* a city —
    // and it names it, so the tap is a confirmation rather than a guess.
    const shortcuts: QuickNode[] = [];
    for (const shortcut of input.shortcuts ?? []) {
      const resolved = resolveShortcut(shortcut.value ?? shortcut.label, draft.values);
      if (resolved) {
        shortcuts.push({ ...shortcut, value: resolved, label: `${shortcut.label} · ${resolved}` });
      }
    }
    const recent = ["currentCity", "nativePlace", "workLocation", "birthPlace"]
      .filter((k) => k !== field.key)
      .map((k) => draft.values[k] ?? "")
      .filter(Boolean);
    control = (
      <div className="mt-4">
        <PlacePicker
          value={value}
          popular={spec?.popular ?? POPULAR_CITIES}
          recent={recent}
          shortcuts={shortcuts}
          onPick={answer}
        />
      </div>
    );
  } else if (input?.kind === "wheel") {
    control = (
      <div className="mt-4">
        <HeightWheel values={input.values} value={value} onChange={commit} />
      </div>
    );
    cta = { label: t("profile.smartDeck.confirm", "Confirm"), onClick: () => answer(value || input.values[0]) };
  } else if (input?.kind === "date") {
    control = (
      <div className="mt-4">
        <DateWheel value={value} onChange={commit} />
      </div>
    );
    cta = {
      label: t("profile.smartDeck.confirm", "Confirm"),
      // The wheels always show *something*, so an untouched card still has a
      // date under it — commit whatever is on screen rather than refusing.
      onClick: () => answer(value || todayMinus(27)),
    };
  } else if (input?.kind === "time") {
    control = (
      <div className="mt-4">
        <TimeWheel value={value} onChange={commit} />
      </div>
    );
    cta = { label: t("profile.smartDeck.confirm", "Confirm"), onClick: () => answer(value || "subah 6:00") };
  } else if (input?.kind === "stepper") {
    control = (
      <div className="mt-5">
        <Stepper stops={input.stops} value={value} onChange={commit} />
      </div>
    );
    if (soleFieldOnCard) {
      cta = {
        label: t("profile.smartDeck.confirm", "Confirm"),
        onClick: () => answer(value || input.stops[0]),
      };
    }
  } else if (input?.kind === "text" || (!input && field.type !== "textarea" && !field.options)) {
    control = (
      <div className="mt-5" onPointerDownCapture={(e) => e.stopPropagation()}>
        <Input
          className="deck-input"
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              e.preventDefault();
              answer(value);
            }
          }}
        />
      </div>
    );
    cta = {
      label: t("profile.smartDeck.next", "Next"),
      onClick: () => answer(value),
      disabled: value.trim().length === 0,
    };
  } else if (field.type === "textarea" && !input) {
    control = (
      <div className="mt-5" onPointerDownCapture={(e) => e.stopPropagation()}>
        <Textarea className="deck-input" rows={4} value={value} placeholder={field.placeholder} onChange={(e) => commit(e.target.value)} />
      </div>
    );
    cta = { label: t("profile.smartDeck.save", "Save"), onClick: () => answer(value), disabled: value.trim().length === 0 };
  } else {
    /* Chips — the default, and the case that carries most of the catalog. */
    const all = spec ? dynamicNodes(spec, draft.values) : (field.options ?? []).map((label) => ({ label }));
    const nodes = path.length > 0 ? (path[path.length - 1].children ?? []) : all;
    const isMulti = Boolean(input?.kind === "chips" && input.multi) || multi;
    const columns = input?.kind === "chips" ? input.columns : undefined;

    control = (
      <div className="mt-4">
        <Crumbs path={path} onPop={(depth) => setPath(path.slice(0, depth))} />
        <ChipGrid
          nodes={nodes}
          selected={picked}
          multi={isMulti}
          columns={columns}
          onPick={(node) => {
            if (node.children?.length) {
              setPath([...path, node]);
              return;
            }
            const v = node.value ?? node.label;
            if (!isMulti) {
              answer(v);
              return;
            }
            const next = picked.includes(v) ? picked.filter((p) => p !== v) : [...picked, v];
            commit(next.join(", "));
          }}
        />
      </div>
    );

    if (isMulti && soleFieldOnCard) {
      cta = {
        label: t("profile.smartDeck.done", "Done"),
        onClick: () => answer(picked.join(", ")),
        disabled: picked.length === 0,
      };
    }
  }

  /* ---------------- the outs ---------------- */

  const escapes: QuickEscape[] = [...(spec?.escapes ?? [])];
  // Optional fields always get a plain skip, unless the spec already offers a
  // more precise version of the same out.
  if (!field.required && escapes.length === 0 && field.type !== "photo") {
    escapes.push({ label: t("profile.smartDeck.skip", "Skip"), value: null, icon: "skip" });
  }

  return (
    <div className="text-center">
      <div className="deck-label">
        <span className="deck-label-icon">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="deck-label-name">{field.label}</span>
        {field.required ? (
          <span className="text-danger">*</span>
        ) : (
          <span className="deck-label-optional">{t("profile.smartDeck.optional", "optional")}</span>
        )}
        {field.whyNeeded && <InfoTip text={field.whyNeeded} />}
        {answered && <Check className="size-3.5 shrink-0 text-trust" aria-hidden />}
      </div>

      <p className="deck-question mt-3">
        {path.length > 0 && path[path.length - 1].ask ? path[path.length - 1].ask : questionFor(field, forSelf)}
      </p>
      {spec?.hint && path.length === 0 && <p className="qd-hint">{spec.hint}</p>}

      {control}

      {cta && (
        <button type="button" onClick={cta.onClick} disabled={cta.disabled} className="qd-cta">
          {cta.label}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      )}

      {/* "Not listed" only ever appears on a field whose type accepts a free
          string. On a `select`, a hand-typed value fails `isAnswered` and the
          answer would vanish the moment it was given — see quickPicks.ts. */}
      {(escapes.length > 0 || spec?.other) && (
        <div className="qd-escapes">
          {escapes.map((esc) => (
            <button key={esc.label} type="button" onClick={() => escape(esc)} className="qd-escape">
              <QuickIcon name={esc.icon} className="size-3.5" />
              {esc.label}
            </button>
          ))}
          {spec?.other && !otherOpen && (
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setOtherOpen(true);
                setOtherText(value);
              }}
              className="qd-escape"
            >
              <PenLine className="size-3.5" aria-hidden />
              {t("profile.smartDeck.notListed", "Not listed")}
            </button>
          )}
        </div>
      )}

      {otherOpen && (
        <div className="mt-3 flex items-center gap-2" onPointerDownCapture={(e) => e.stopPropagation()}>
          <Input
            className="deck-input"
            autoFocus
            value={otherText}
            placeholder={field.placeholder ?? t("profile.smartDeck.otherPlaceholder", "Apne shabdon me likhein")}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && otherText.trim()) {
                e.preventDefault();
                setOtherOpen(false);
                answer(otherText.trim());
              }
            }}
          />
          <button
            type="button"
            disabled={otherText.trim().length === 0}
            onClick={() => {
              setOtherOpen(false);
              answer(otherText.trim());
            }}
            className="deck-next shrink-0"
            aria-label={t("profile.smartDeck.next", "Next")}
          >
            <ArrowRight className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

function todayMinus(years: number): string {
  const d = new Date();
  return `15/06/${d.getFullYear() - years}`;
}

/* ================================================================== */
/* About Me, without a blank box                                       */
/* ================================================================== */

/**
 * Three chip questions, then a paragraph the user approves.
 *
 * The sentences are composed in code (`composeAboutMe`), not by a model. At
 * this point the answer is already fully determined by what was tapped, so a
 * model call would only add a wait, a cost, and the chance of a sentence
 * nobody agreed to. `BioWriter` is still there for anyone who wants the model
 * to write it — this is the path with no typing and no waiting.
 */
function AboutMeComposer({
  field,
  forSelf,
  onDone,
}: {
  field: ProfileFieldDef;
  forSelf: boolean;
  onDone: (text: string) => void;
}) {
  const t = useT();
  const { draft } = useProfile();
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [text, setText] = useState(draft.values[field.key] ?? "");
  const [editing, setEditing] = useState(false);

  const card = COMPOSE_CARDS[step];

  if (card) {
    const chosen = picks[card.key] ?? [];
    return (
      <div className="mt-4">
        <p className="qd-compose-ask">{card.ask}</p>
        <ChipGrid
          nodes={card.options.map((label) => ({ label }))}
          selected={chosen}
          multi
          // Functional, not `setPicks({ ...picks, ... })`: two taps inside one
          // React batch would both read the same render's `picks` and the
          // second would drop the first. Rare with a finger, certain with a
          // double-tap — and a silently unrecorded chip is the worst failure
          // this deck can have, because the sentence still gets written.
          onPick={(node) => {
            const v = node.value ?? node.label;
            setPicks((prev) => {
              const at = prev[card.key] ?? [];
              return { ...prev, [card.key]: at.includes(v) ? at.filter((c) => c !== v) : [...at, v] };
            });
          }}
        />
        <div className="qd-compose-nav">
          <span className="qd-compose-step">
            {step + 1}/{COMPOSE_CARDS.length}
          </span>
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => {
              haptic("tap");
              const next = step + 1;
              if (next < COMPOSE_CARDS.length) {
                setStep(next);
                return;
              }
              setText(composeAboutMe(picks, { name: draft.values.fullName, forSelf }));
              setStep(next);
            }}
            className="qd-cta qd-cta-inline"
          >
            {step + 1 === COMPOSE_CARDS.length
              ? t("profile.smartDeck.compose.write", "Write It")
              : t("profile.smartDeck.next", "Next")}
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {editing ? (
        <div onPointerDownCapture={(e) => e.stopPropagation()}>
          <Textarea className="deck-input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      ) : (
        <p className="qd-compose-preview">{text}</p>
      )}
      <div className="qd-compose-actions">
        <button type="button" onClick={() => onDone(text)} disabled={!text.trim()} className="qd-cta qd-cta-inline">
          <Check className="size-4" aria-hidden />
          {t("profile.smartDeck.compose.approve", "Approve")}
        </button>
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setStep(0);
          }}
          className="qd-escape"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          {t("profile.smartDeck.compose.redo", "Change Answers")}
        </button>
        <button type="button" onClick={() => setEditing((e) => !e)} className="qd-escape">
          <PenLine className="size-3.5" aria-hidden />
          {editing ? t("profile.smartDeck.compose.preview", "Preview") : t("profile.smartDeck.compose.edit", "Edit")}
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Card shell, footer, completion                                      */
/* ================================================================== */

function CardShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="deck-card">
      <div className="deck-card-body">
        <div className="deck-card-scroll">{children}</div>
      </div>
      {footer}
    </div>
  );
}

function StackGhost({ depth }: { depth: number }) {
  return <div className="deck-ghost" data-depth={depth} aria-hidden />;
}

function DeckFooter({
  index,
  total,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useT();
  return (
    <div className="deck-footer">
      <button
        type="button"
        onClick={onPrev}
        disabled={index === 0}
        aria-label={t("profile.smartDeck.back", "Back")}
        className="deck-back touch-target"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("profile.smartDeck.back", "Back")}
      </button>
      <span className="deck-hint">
        <Hand className="size-4 shrink-0" aria-hidden />
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={index >= total}
        aria-label={t("profile.smartDeck.next", "Next")}
        className="deck-next"
      >
        <ArrowRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}

function CompletionCard({
  live,
  missingReq,
  onJump,
  onPrev,
  scopeLabel,
  gate,
  onDone,
}: {
  live: boolean;
  missingReq: ProfileFieldDef[];
  onJump: (key: string) => void;
  onPrev: () => void;
  scopeLabel?: string | null;
  gate?: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const section = Boolean(scopeLabel) && !gate;
  return (
    <div className="deck-card">
      <div className="deck-card-body">
        <div className="deck-card-scroll flex-col items-center justify-center text-center">
          <div
            className={cn(
              "w-full max-w-sm rounded-2xl border px-5 py-8",
              live || section ? "border-trust/25 bg-trust-bg" : "border-line bg-bg-subtle",
            )}
          >
            {live || section ? (
              <BadgeCheck className="mx-auto size-10 text-trust" />
            ) : (
              <Sparkles className="mx-auto size-10 text-primary-text" />
            )}
            <h1 className="deck-question mt-3">
              {section
                ? t("profile.smartDeck.doneScoped", "{section} ho gaya").replace("{section}", scopeLabel!)
                : live
                  ? t("profile.smartDeck.doneLive", "Aapki profile ab live hai")
                  : t("profile.smartDeck.doneNotLive", "Bas thoda aur baaki hai")}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-pretty leading-relaxed text-muted">
              {section
                ? t("profile.smartDeck.doneScopedBody", "Save ho gaya. Wapas jaakar agla section chun sakte hain.")
                : live
                  ? t(
                      "profile.smartDeck.doneLiveBody",
                      "Zaroori baatein poori ho gayin. Baaki details jab chahein tab add kar sakte hain — profile abhi bhi live rahegi.",
                    )
                  : t(
                      "profile.smartDeck.doneNotLiveBody",
                      "{count} zaroori baatein abhi baaki hain — inke bina profile live nahi hogi.",
                    ).replace("{count}", String(missingReq.length))}
            </p>
          </div>

          {missingReq.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[0.8125rem] text-warn">{t("profile.smartDeck.remaining", "Baaki:")}</span>
              {missingReq.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => onJump(f.key)}
                  className="rounded-full border border-warn/40 bg-warn-bg px-2.5 py-1 text-[0.75rem] font-medium text-warn transition-colors hover:bg-warn/15"
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3">
            {missingReq.length > 0 ? (
              <Button onClick={() => onJump(missingReq[0].key)}>
                {t("profile.smartDeck.fillRequired", "Fill Required Fields")}
              </Button>
            ) : section || gate ? (
              <Button onClick={onDone}>
                {section ? t("profile.smartDeck.backToList", "Back to List") : t("profile.smartDeck.continue", "Continue")}
              </Button>
            ) : live ? (
              <Link
                href="/user/dashboard"
                className={cn(
                  "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold",
                  "bg-primary text-primary-fg shadow-md transition-all duration-200",
                  "hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-gold",
                )}
              >
                {t("profile.smartDeck.viewDashboard", "View Dashboard")}
              </Link>
            ) : null}
            <Button variant="secondary" onClick={onPrev}>
              <ArrowLeft className="size-4" />
              {t("profile.smartDeck.goBack", "Go Back")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The one-time coach. Shorter-lived than the old deck's, and it says the one
 * thing that is genuinely new here: you do not have to press anything.
 */
function TapCoach() {
  const t = useT();
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={ease.fast}
      className="pointer-events-none absolute inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] z-20 flex justify-center px-8"
    >
      <div className="flex max-w-[17rem] flex-col items-center gap-1.5 rounded-xl bg-surface-inverse px-4 py-3 text-center shadow-lg">
        <motion.span
          className="text-inverse"
          animate={reduced ? undefined : { scale: [1, 0.86, 1], opacity: [0.6, 1, 0.6] }}
          transition={reduced ? undefined : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Hand className="size-5" aria-hidden />
        </motion.span>
        <p className="text-[0.75rem] leading-snug text-inverse">
          {t(
            "profile.smartDeck.coach",
            "Bas jawaab par tap kijiye — agla sawaal khud aa jayega. Peeche jaana ho to right swipe ya Back.",
          )}
        </p>
      </div>
    </motion.div>
  );
}

/* ================================================================== */
/* The deck                                                            */
/* ================================================================== */

export default function SmartProfileDeck({
  onBack,
  initialFocusKey,
  only,
  pendingOnly = false,
  scopeLabel,
  gate = false,
  onOpenFullForm,
  noticeText,
}: {
  onBack: () => void;
  initialFocusKey?: string | null;
  only?: readonly string[] | null;
  pendingOnly?: boolean;
  scopeLabel?: string | null;
  gate?: boolean;
  /** Hands the user to `ManualProfileFormMobile` — the long-form fallback. */
  onOpenFullForm?: () => void;
  /**
   * A standing line under the title, for a deck that is not editing the
   * signed-in person's own profile — "Client draft — public nahi hai". The
   * deck itself is provider-agnostic (see `ProfileContextValue`), so this is
   * the one place the surrounding context gets to say whose data is on screen,
   * and it stays visible on every card rather than appearing once and
   * scrolling away.
   */
  noticeText?: string | null;
}) {
  const t = useT();
  const { draft, live } = useProfile();

  const [cards] = useState<ProfileFieldDef[][]>(() =>
    buildCards(selectDeckFields(draft.values, { only, pendingOnly, focusKey: initialFocusKey })),
  );
  const total = cards.length;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [showCoach, setShowCoach] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismissCoach() {
    setShowCoach(false);
    try {
      window.localStorage.setItem(HINT_SEEN_KEY, "1");
    } catch {
      /* storage blocked (private mode) — the hint just shows again next time */
    }
  }

  useEffect(() => {
    try {
      if (window.localStorage.getItem(HINT_SEEN_KEY)) return;
    } catch {
      return;
    }
    setShowCoach(true);
    const hide = setTimeout(dismissCoach, HINT_DURATION_MS);
    return () => clearTimeout(hide);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // A pending auto-advance must not fire into a card the user has since
  // navigated away from — every manual move cancels it.
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  function cardIndexForKey(key: string) {
    return cards.findIndex((c) => c.some((f) => f.key === key));
  }

  const [index, setIndex] = useState(() => {
    const i = initialFocusKey ? cardIndexForKey(initialFocusKey) : -1;
    return i >= 0 ? i : 0;
  });

  const forSelf = draft.fillingFor === "self";
  const deckKeys = new Set(cards.flat().map((f) => f.key));
  const missingReq = missingRequired(draft.values).filter((f) => deckKeys.has(f.key));

  function cancelAdvance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }

  function goNext() {
    cancelAdvance();
    haptic("tap");
    dismissCoach();
    setIndex((i) => Math.min(i + 1, total));
  }

  function goPrev() {
    cancelAdvance();
    haptic("tap");
    dismissCoach();
    setIndex((i) => Math.max(i - 1, 0));
  }

  function jumpTo(key: string) {
    const i = cardIndexForKey(key);
    if (i < 0) return;
    cancelAdvance();
    haptic("tap");
    dismissCoach();
    setIndex(i);
  }

  /**
   * The auto-advance. Deliberately delayed rather than immediate: the chip has
   * to be seen to go blush-and-ticked, or the card appears to have changed on
   * its own and the user cannot tell what was recorded.
   */
  function advanceSoon() {
    cancelAdvance();
    dismissCoach();
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      haptic("success");
      setIndex((i) => Math.min(i + 1, total));
    }, ADVANCE_MS);
  }

  function handleDismiss(direction: ManualCardDirection) {
    if (direction === "LEFT") goNext();
    else goPrev();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleIndices: number[] = [];
  for (let d = 0; d < STACK_DEPTH; d++) {
    const i = index + d;
    if (i > total) break;
    visibleIndices.push(i);
  }

  if (!mounted) return null;

  /**
   * Progress counts *answers*, not cards seen. "5 of 8 done" survives jumping
   * around and skipping; "card 5 of 8" quietly claims credit for every card
   * the user swiped past without answering.
   */
  const answeredCount = cards.filter((c) =>
    c.every((f) => f.type === "photo" || isAnswered(f, draft.values)),
  ).length;

  const footer = <DeckFooter index={index} total={total} onPrev={goPrev} onNext={goNext} />;

  return createPortal(
    <div className="deck deck-canvas fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden">
      <header className="relative z-10 mx-auto w-full max-w-[430px] shrink-0 px-5 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:max-w-[560px]">
        <div className="text-center">
          <Ornament className="deck-ornament mx-auto h-3 w-6" />
          {scopeLabel && <h1 className="deck-title mt-1">{scopeLabel}</h1>}
          {noticeText && (
            <p className="mx-auto mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn-bg px-3 py-1 text-[0.75rem] font-medium text-warn">
              <Lock className="size-3" aria-hidden />
              {noticeText}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              cancelAdvance();
              haptic("tap");
              onBack();
            }}
            aria-label={t("profile.smartDeck.close", "Close")}
            className="deck-close size-9 shrink-0 touch-target"
          >
            <X className="size-5" />
          </button>

          <div
            className="deck-progress flex-1"
            role="progressbar"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <div className="deck-progress-fill" style={{ width: `${(answeredCount / total) * 100}%` }} />
          </div>
          <span className="deck-progress-count" aria-hidden>
            {answeredCount}/{total}
          </span>
        </div>
      </header>

      {/* The extra bottom padding when the full-form link is showing is the
          room that link sits in — without it the link renders *under* the
          card, since the stack is `h-full` inside this box. */}
      <div
        className={cn(
          "relative mx-auto w-full max-w-[430px] flex-1 px-8 pt-4 sm:max-w-[560px]",
          onOpenFullForm
            ? "pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))]"
            : "pb-[calc(2rem+env(safe-area-inset-bottom,0px))]",
        )}
      >
        <div className="relative h-full w-full">
          <AnimatePresence initial={false}>
            {[...visibleIndices].reverse().map((i, pos) => {
              const depth = visibleIndices.length - 1 - pos;
              let content: React.ReactNode;
              if (depth > 0) {
                content = <StackGhost depth={depth} />;
              } else {
                const card = i < cards.length ? cards[i] : null;
                content = card ? (
                  <CardShell footer={footer}>
                    <div className="m-auto w-full">
                      {card.map((f, n) => (
                        <Fragment key={f.key}>
                          {n > 0 && (
                            <div className="deck-divider" aria-hidden>
                              <Ornament className="h-3 w-6 shrink-0" />
                            </div>
                          )}
                          <QuickField
                            field={f}
                            forSelf={forSelf}
                            soleFieldOnCard={card.length === 1}
                            onAnswered={() => {
                              // A paired card waits for its second answer;
                              // the values it reads are the ones after this
                              // tap, so the field just answered counts too.
                              const done = card.every(
                                (other) =>
                                  other.key === f.key ||
                                  other.type === "photo" ||
                                  isAnswered(other, draft.values),
                              );
                              if (done) advanceSoon();
                            }}
                          />
                        </Fragment>
                      ))}
                      {/* The photo card is the one card with nothing to
                          auto-advance on — uploading is not a tap on an
                          answer, so it gets an explicit way onward. */}
                      {card.length === 1 && card[0].type === "photo" && (
                        <button type="button" onClick={goNext} className="qd-cta">
                          {t("profile.smartDeck.photoContinue", "Continue")}
                          <ArrowRight className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </CardShell>
                ) : (
                  <CompletionCard
                    live={live}
                    missingReq={missingReq}
                    onJump={jumpTo}
                    onPrev={goPrev}
                    scopeLabel={scopeLabel}
                    gate={gate}
                    onDone={onBack}
                  />
                );
              }
              return (
                <ManualCard key={i} draggable={depth === 0} depth={depth} onDismiss={handleDismiss}>
                  {content}
                </ManualCard>
              );
            })}
          </AnimatePresence>
        </div>

        {/* The long form is never the default any more, but it must never be
            unreachable either — a rare answer, a field someone wants to read
            in full, or simply a preference for a form. */}
        {onOpenFullForm && (
          <button type="button" onClick={onOpenFullForm} className="qd-fullform">
            {t("profile.smartDeck.fullForm", "Open Detailed Form")}
          </button>
        )}
      </div>

      <AnimatePresence>{showCoach && <TapCoach key="tap-coach" />}</AnimatePresence>
    </div>,
    document.body,
  );
}
