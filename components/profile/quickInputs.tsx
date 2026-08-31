"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Award, BookOpen, Briefcase, Camera, Check, ChefHat, ChevronLeft, Code, Drumstick,
  Egg, Film, GraduationCap, Hand, Heart, HeartCrack, HeartHandshake, Home, IndianRupee,
  Landmark, Leaf, Lock, MapPin, Minus, Music, Pause, PersonStanding, Plane, Plus,
  School, Scale, Search, SkipForward, Sparkles, Sprout, Stethoscope, Store, TrendingUp,
  Trophy, User, Users, Wrench, X, type LucideIcon,
} from "lucide-react";
import { haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import {
  INDIA_PLACES,
  searchCities,
  stateOfCity,
  type QuickNode,
} from "@/lib/profile/quickPicks";

/**
 * The tap deck's input primitives — chips, wheels, the place picker, the
 * stepper.
 *
 * Split out from `SmartProfileDeck` because they are the part with real
 * behaviour (scroll physics, snap, search) and none of the deck's own
 * concerns (which field, which card, what counts as finished). Every one of
 * them is the same shape: it is handed the current value and calls back with
 * a new one. **None of them writes to the draft** — the deck does that, in one
 * place, which is what makes "every tap saves" a single line rather than a
 * promise repeated in eight components.
 *
 * All of them live inside `.deck`, so they inherit that island's tokens (see
 * "THE PROFILE DECK" in globals.css) and are styled with `.qd-*` classes
 * defined in the same block.
 */

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

/**
 * `quickPicks.ts` names an icon as a string rather than importing one, so the
 * catalog stays a plain data file that the server can read. This is where the
 * name becomes a component.
 */
export const QUICK_ICON: Record<string, LucideIcon> = {
  male: PersonStanding, female: PersonStanding,
  heart: Heart, heartCrack: HeartCrack, heartHandshake: HeartHandshake,
  briefcase: Briefcase, code: Code, rupee: IndianRupee, stethoscope: Stethoscope,
  graduation: GraduationCap, wrench: Wrench, trending: TrendingUp, landmark: Landmark,
  scale: Scale, camera: Camera, plane: Plane, users: Users, store: Store,
  sparkles: Sparkles, sun: Sparkles, pause: Pause, school: School, award: Award,
  home: Home, sprout: Sprout, leaf: Leaf, drumstick: Drumstick, egg: Egg,
  book: BookOpen, music: Music, trophy: Trophy, chef: ChefHat, film: Film,
  yoga: PersonStanding, mapPin: MapPin, check: Check, user: User,
  unknown: Hand, private: Lock, skip: SkipForward,
};

export function QuickIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = name ? QUICK_ICON[name] : undefined;
  if (!Icon) return null;
  return <Icon className={className} aria-hidden />;
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

export function ChipGrid({
  nodes,
  selected,
  multi = false,
  columns,
  onPick,
}: {
  nodes: QuickNode[];
  /** The values currently chosen. One entry unless `multi`. */
  selected: string[];
  multi?: boolean;
  columns?: 1 | 2;
  onPick: (node: QuickNode) => void;
}) {
  const t = useT();
  return (
    <>
      {/* Every other card in this deck moves on by itself the moment you tap.
          A multi-select is the one that waits, so it has to say so — without
          this line the card reads as broken for the beat before the user
          notices the Done button below it. */}
      {multi && (
        <p className="qd-multi-note">
          {t("profile.smartDeck.multiNote", "Ek se zyada chun sakte hain")}
        </p>
      )}
      <div
        className={cn(
          "qd-chips",
          columns === 2 && "qd-chips-2col",
          columns === 1 && "qd-chips-1col",
        )}
      >
        {nodes.map((node) => {
          const value = node.value ?? node.label;
          const on = selected.includes(value);
          const branch = Boolean(node.children?.length);
          return (
            <button
              key={`${node.label}:${value}`}
              type="button"
              aria-pressed={on}
              onClick={() => {
                haptic("select");
                onPick(node);
              }}
              className="deck-chip qd-chip touch-target"
            >
              <QuickIcon name={node.icon} className="qd-chip-icon" />
              <span className="qd-chip-label">{node.label}</span>
              {/* A branch says so with a caret rather than a tick: tapping it
                  opens the next question, and a tick there would claim the
                  field is answered when it is one tap from being asked
                  again. */}
              {branch ? (
                <span className="qd-chip-more" aria-hidden>
                  ›
                </span>
              ) : on ? (
                <span className="deck-chip-check">
                  <Check className="size-3.5" aria-hidden />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * The trail of branches already taken — "Job › IT / Software".
 *
 * Every crumb is a button that pops back to it. This is the entire "back"
 * story inside a card: the deck's own Back leaves the card, a crumb rewinds
 * within it, and the two never compete for the same tap.
 */
export function Crumbs({ path, onPop }: { path: QuickNode[]; onPop: (depth: number) => void }) {
  if (path.length === 0) return null;
  return (
    <div className="qd-crumbs">
      {path.map((node, i) => (
        <button
          key={`${node.label}-${i}`}
          type="button"
          onClick={() => {
            haptic("tap");
            onPop(i);
          }}
          className="qd-crumb"
        >
          {node.label}
          <X className="size-3" aria-hidden />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The wheel                                                           */
/* ------------------------------------------------------------------ */

const ITEM_H = 42;
/** Odd, so there is a true middle row for the selection band to sit on. */
const VISIBLE = 5;
const WHEEL_H = ITEM_H * VISIBLE;
const PAD = (WHEEL_H - ITEM_H) / 2;
/** How long the scroll has to be still before we call it settled. */
const SETTLE_MS = 110;

/**
 * One scrolling column.
 *
 * Snapping is done by hand (a `scrollTo` once the scroll goes quiet) rather
 * than with CSS `scroll-snap`. The reason is the card this lives inside:
 * `ManualCard` turns off native touch scrolling (`touch-action: none`) and
 * drives any inner scroller by assigning `scrollTop` frame by frame — and a
 * mandatory snap container fights that assignment on every frame, so the
 * column judders and lands wherever the fight ended. Snapping after the fact
 * composes with it instead.
 */
function WheelColumn({
  values,
  index,
  onChange,
  label,
  wide,
}: {
  values: string[];
  index: number;
  onChange: (next: number) => void;
  label: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while we are the ones moving the column, so our own scroll events
   *  do not read as the user turning it. */
  const selfScrolling = useRef(false);

  // Park on the selected row — on mount, and whenever the value changes from
  // outside (a "Don't know" that resets it, a card re-entered later).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * ITEM_H;
    if (Math.abs(el.scrollTop - target) < 2) return;
    selfScrolling.current = true;
    el.scrollTo({ top: target, behavior: "auto" });
    const done = setTimeout(() => {
      selfScrolling.current = false;
    }, 60);
    return () => clearTimeout(done);
  }, [index]);

  function handleScroll() {
    if (selfScrolling.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const next = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_H)));
      selfScrolling.current = true;
      el.scrollTo({ top: next * ITEM_H, behavior: "smooth" });
      setTimeout(() => {
        selfScrolling.current = false;
      }, 240);
      if (next !== index) {
        haptic("select");
        onChange(next);
      }
    }, SETTLE_MS);
  }

  return (
    <div className={cn("qd-wheel", wide && "qd-wheel-wide")}>
      <span className="qd-wheel-label">{label}</span>
      <div className="qd-wheel-window">
        <div className="qd-wheel-band" aria-hidden />
        <div
          ref={ref}
          className="qd-wheel-scroll"
          style={{ height: WHEEL_H, paddingBlock: PAD }}
          onScroll={handleScroll}
          role="listbox"
          aria-label={label}
          tabIndex={0}
        >
          {values.map((v, i) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={i === index}
              onClick={() => {
                haptic("select");
                onChange(i);
              }}
              className={cn("qd-wheel-item", i === index && "qd-wheel-item-on")}
              style={{ height: ITEM_H }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Height — one column, every inch. */
export function HeightWheel({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useT();
  const index = Math.max(0, values.indexOf(value));
  const fallback = values.indexOf("5'5\"");
  const start = values.includes(value) ? index : fallback >= 0 ? fallback : Math.floor(values.length / 2);
  return (
    <div className="qd-wheels">
      <WheelColumn
        values={values}
        index={start}
        label={t("profile.smartDeck.wheel.height", "Height")}
        wide
        onChange={(i) => onChange(values[i])}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Date of birth                                                       */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysIn(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** DD/MM/YYYY or YYYY-MM-DD — see the note in `DateWheel`. */
function parseWheelDate(value: string): { day: number; month: number; year: number } | null {
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return { day: Number(dmy[1]), month: Number(dmy[2]) - 1, year: Number(dmy[3]) };
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { day: Number(iso[3]), month: Number(iso[2]) - 1, year: Number(iso[1]) };
  return null;
}

function ageOn(d: number, m: number, y: number): number {
  const now = new Date();
  let age = now.getFullYear() - y;
  const hadBirthday = now.getMonth() > m || (now.getMonth() === m && now.getDate() >= d);
  if (!hadBirthday) age--;
  return age;
}

/**
 * Three wheels and a live age read-out.
 *
 * The age is the point. A date of birth is the one answer people routinely
 * mis-tap by a decade, and "Age 27" under the wheels catches that in the same
 * glance — where DD/MM/YYYY alone has to be read and subtracted.
 *
 * The year range is 18–70 because that is the range this product can serve;
 * a wheel that offers 2015 is a wheel that lets someone pick it.
 */
export function DateWheel({
  value,
  onChange,
}: {
  /** DD/MM/YYYY, or empty. */
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useT();
  const thisYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: 53 }, (_, i) => String(thisYear - 18 - i)),
    [thisYear],
  );

  /**
   * Two formats arrive here, and both are real.
   *
   * The form writes DD/MM/YYYY (what `parseDateOfBirth` in fieldMapping.ts
   * reads first), but a draft rehydrated from the server comes back as the
   * column's own YYYY-MM-DD. Reading only one of them is how a saved date of
   * birth silently reopens as "27 years old, 15 June" — the wheels would show
   * a date the user never picked, and Confirm would write it.
   */
  const parsed = parseWheelDate(value);
  const day = parsed?.day ?? 15;
  const month = parsed?.month ?? 5;
  const year = parsed?.year ?? thisYear - 27;

  const dayCount = daysIn(month, year);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => String(i + 1)),
    [dayCount],
  );

  function emit(d: number, m: number, y: number) {
    // A 31st that survives a swing to February would be a date nobody picked.
    const clamped = Math.min(d, daysIn(m, y));
    onChange(`${String(clamped).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${y}`);
  }

  const yearIndex = Math.max(0, years.indexOf(String(year)));

  return (
    <div>
      <div className="qd-wheels">
        <WheelColumn
          values={days}
          index={Math.min(day, dayCount) - 1}
          label={t("profile.smartDeck.wheel.day", "Din")}
          onChange={(i) => emit(i + 1, month, year)}
        />
        <WheelColumn
          values={MONTHS}
          index={month}
          label={t("profile.smartDeck.wheel.month", "Mahina")}
          onChange={(i) => emit(day, i, year)}
        />
        <WheelColumn
          values={years}
          index={yearIndex}
          label={t("profile.smartDeck.wheel.year", "Saal")}
          wide
          onChange={(i) => emit(day, month, Number(years[i]))}
        />
      </div>
      {/* The age is the point of this read-out: a date of birth is the one
          answer people routinely mis-tap by a decade, and "Age 27" catches
          that in the same glance the wheels are already in. */}
      <p className="qd-readout">
        {t("profile.smartDeck.age", "Age {n}").replace("{n}", String(ageOn(day, month, year)))}
        {!parsed && ` · ${t("profile.smartDeck.confirmToSave", "Confirm karke save karein")}`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Time of birth                                                       */
/* ------------------------------------------------------------------ */

/**
 * Hour lists per part of the day.
 *
 * These ranges are not decoration — `parseBirthTime` (kundli/chart.ts) reads
 * the Hinglish period word to decide AM or PM, and "raat 12" would come back
 * as noon. Offering only the hours each word can actually mean is what keeps
 * a picked time and a parsed time the same time.
 */
const PERIODS: { label: string; word: string; hours: number[] }[] = [
  { label: "Subah", word: "subah", hours: [4, 5, 6, 7, 8, 9, 10, 11] },
  { label: "Dopahar", word: "dopahar", hours: [12, 1, 2, 3] },
  { label: "Shaam", word: "shaam", hours: [4, 5, 6, 7] },
  { label: "Raat", word: "raat", hours: [8, 9, 10, 11] },
  { label: "Tadke", word: "tadke", hours: [12, 1, 2, 3] },
];

const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export function TimeWheel({
  value,
  onChange,
}: {
  /** "subah 6:30" style, or empty. */
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useT();
  const m = value.match(/^(\w+)\s+(\d{1,2}):(\d{2})$/);
  const periodIndex = Math.max(0, PERIODS.findIndex((p) => p.word === (m?.[1] ?? "subah")));
  const period = PERIODS[periodIndex];
  const hour = m ? Number(m[2]) : period.hours[2] ?? period.hours[0];
  const minute = m ? m[3] : "00";

  const hourStrings = period.hours.map(String);
  const hourIndex = Math.max(0, hourStrings.indexOf(String(hour)));

  function emit(pIndex: number, h: number, min: string) {
    const p = PERIODS[pIndex];
    // Swapping "subah" for "shaam" can strand an hour the new word cannot
    // mean — land on that period's nearest hour instead of an invalid one.
    const useHour = p.hours.includes(h) ? h : p.hours[0];
    onChange(`${p.word} ${useHour}:${min}`);
  }

  return (
    <div className="qd-wheels">
      <WheelColumn
        values={PERIODS.map((p) => p.label)}
        index={periodIndex}
        label={t("profile.smartDeck.wheel.period", "Kab")}
        wide
        onChange={(i) => emit(i, hour, minute)}
      />
      <WheelColumn
        values={hourStrings}
        index={hourIndex}
        label={t("profile.smartDeck.wheel.hour", "Ghanta")}
        onChange={(i) => emit(periodIndex, period.hours[i], minute)}
      />
      <WheelColumn
        values={MINUTES}
        index={Math.max(0, MINUTES.indexOf(minute))}
        label={t("profile.smartDeck.wheel.minute", "Minute")}
        onChange={(i) => emit(periodIndex, hour, MINUTES[i])}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stepper                                                             */
/* ------------------------------------------------------------------ */

export function Stepper({
  stops,
  value,
  onChange,
}: {
  stops: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useT();
  const index = Math.max(0, stops.indexOf(value));
  const at = stops.includes(value) ? index : 0;

  function step(delta: number) {
    const next = Math.max(0, Math.min(stops.length - 1, at + delta));
    if (next === at && stops.includes(value)) return;
    haptic("select");
    onChange(stops[next]);
  }

  return (
    <div className="qd-stepper">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={at === 0 && stops.includes(value)}
        aria-label={t("profile.smartDeck.stepDown", "Kam karein")}
        className="qd-step-btn touch-target"
      >
        <Minus className="size-5" aria-hidden />
      </button>
      <span className={cn("qd-step-value", !stops.includes(value) && "qd-step-value-empty")}>
        {stops.includes(value) ? value : stops[0]}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={at === stops.length - 1}
        aria-label={t("profile.smartDeck.stepUp", "Zyada karein")}
        className="qd-step-btn touch-target"
      >
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Place picker                                                        */
/* ------------------------------------------------------------------ */

/**
 * Current location → recent → popular → state → city.
 *
 * Search is present but is the fourth thing offered, not the first: a text box
 * at the top of a picker is an invitation to type, and typing is exactly what
 * this deck exists to remove. It earns its place for the person whose city is
 * three taps deep in a state list, and for nobody else.
 *
 * `recent` is the cities this user has already picked on other fields — a
 * native place and a birth place are the same town far more often than not.
 */
export function PlacePicker({
  value,
  popular,
  recent,
  shortcuts,
  onPick,
}: {
  value: string;
  popular: string[];
  recent: string[];
  shortcuts?: QuickNode[];
  onPick: (city: string) => void;
}) {
  const t = useT();
  const [state, setState] = useState<string | null>(() => (value ? stateOfCity(value) : null));
  const [query, setQuery] = useState("");

  const results = query.trim().length >= 2 ? searchCities(query) : [];
  const stateRow = state ? INDIA_PLACES.find((s) => s.state === state) : null;

  // "Recent" must not repeat what the popular row already shows, or the two
  // rows become the same four chips twice.
  const recentUnique = recent.filter((c) => c && !popular.includes(c)).slice(0, 4);

  function pick(city: string) {
    haptic("select");
    onPick(city);
  }

  if (results.length > 0) {
    return (
      <div className="qd-place">
        <PlaceSearch query={query} onQuery={setQuery} />
        <div className="qd-place-list">
          {results.map((r) => (
            <button key={`${r.city}-${r.state}`} type="button" onClick={() => pick(r.city)} className="qd-place-row">
              <MapPin className="size-4 shrink-0 opacity-60" aria-hidden />
              <span className="qd-place-city">{r.city}</span>
              <span className="qd-place-state">{r.state}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (stateRow) {
    return (
      <div className="qd-place">
        <button type="button" onClick={() => setState(null)} className="qd-crumb qd-crumb-back">
          <ChevronLeft className="size-3.5" aria-hidden />
          {stateRow.state}
        </button>
        <div className="qd-chips">
          {stateRow.cities.map((city) => (
            <button
              key={city}
              type="button"
              aria-pressed={city === value}
              onClick={() => pick(city)}
              className="deck-chip qd-chip touch-target"
            >
              <span className="qd-chip-label">{city}</span>
              {city === value && (
                <span className="deck-chip-check">
                  <Check className="size-3.5" aria-hidden />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="qd-place">
      {shortcuts && shortcuts.length > 0 && (
        <div className="qd-chips">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => pick(s.value ?? s.label)}
              className="deck-chip qd-chip qd-chip-quiet touch-target"
            >
              <QuickIcon name={s.icon} className="qd-chip-icon" />
              <span className="qd-chip-label">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {recentUnique.length > 0 && (
        <PlaceRow title={t("profile.smartDeck.recentCities", "Aapne pehle chuna")} cities={recentUnique} value={value} onPick={pick} />
      )}
      <PlaceRow title={t("profile.smartDeck.popularCities", "Sabse zyada chuni jaane wali")} cities={popular} value={value} onPick={pick} />

      <p className="qd-place-heading">{t("profile.smartDeck.byState", "Ya state se dhoondhein")}</p>
      <div className="qd-chips">
        {INDIA_PLACES.map((s) => (
          <button
            key={s.state}
            type="button"
            onClick={() => {
              haptic("tap");
              setState(s.state);
            }}
            className="deck-chip qd-chip qd-chip-quiet touch-target"
          >
            <span className="qd-chip-label">{s.state}</span>
            <span className="qd-chip-more" aria-hidden>
              ›
            </span>
          </button>
        ))}
      </div>

      <PlaceSearch query={query} onQuery={setQuery} />
    </div>
  );
}

function PlaceRow({
  title,
  cities,
  value,
  onPick,
}: {
  title: string;
  cities: string[];
  value: string;
  onPick: (city: string) => void;
}) {
  return (
    <div>
      <p className="qd-place-heading">{title}</p>
      <div className="qd-chips">
        {cities.map((city) => (
          <button
            key={city}
            type="button"
            aria-pressed={city === value}
            onClick={() => onPick(city)}
            className="deck-chip qd-chip touch-target"
          >
            <span className="qd-chip-label">{city}</span>
            {city === value && (
              <span className="deck-chip-check">
                <Check className="size-3.5" aria-hidden />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlaceSearch({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const t = useT();
  return (
    // Stops the swipe gesture claiming a drag that starts in the box, so
    // selecting your own text is never read as "next card".
    <label className="qd-search" onPointerDownCapture={(e) => e.stopPropagation()}>
      <Search className="size-4 shrink-0 opacity-60" aria-hidden />
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t("profile.smartDeck.citySearch", "Sheher ka naam likhein")}
        className="qd-search-input"
        inputMode="search"
      />
      {query && (
        <button type="button" onClick={() => onQuery("")} aria-label={t("profile.smartDeck.clear", "Clear")} className="shrink-0 opacity-60">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </label>
  );
}
