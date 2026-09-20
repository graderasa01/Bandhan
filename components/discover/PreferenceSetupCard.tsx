"use client";

import { useState } from "react";
import { Loader2, Mic, Search, Square } from "lucide-react";
import Card from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import { POPULAR_CITIES } from "@/lib/profile/quickPicks";
import { DISCOVER_MAX_AGE, DISCOVER_MIN_AGE, GENDER_VALUES, type DiscoverFilters, type LookingForGender } from "@/lib/discovery/contract";
import type { DiscoverVoice } from "./useDiscoverVoice";

export interface PreferenceSetupCardProps {
  /** Pre-filled from the viewer's own gender (the opposite), if known. */
  defaultLookingFor: LookingForGender | null;
  viewerCity: string | null;
  /** Filled by the AI when the user answers by voice — the card re-renders with these. */
  prefill: DiscoverFilters | null;
  voice: DiscoverVoice;
  busy: boolean;
  /** Start the search with these temporary filters; `save` also promotes them to the saved preference. */
  onStart: (filters: DiscoverFilters, save: boolean) => void;
  locked: boolean;
}

const ANYWHERE = "Kahin bhi";

/**
 * First use, when the viewer has told the app nothing about the partner they
 * want. No pool is shown until they answer three things; nothing here writes
 * to the saved preference unless the explicit "save" box is ticked — the
 * answers are a *search*, and only become a *preference* on request.
 */
export default function PreferenceSetupCard({ defaultLookingFor, viewerCity, prefill, voice, busy, onStart, locked }: PreferenceSetupCardProps) {
  const t = useT();
  const [gender, setGender] = useState<LookingForGender | undefined>(prefill?.lookingForGender ?? defaultLookingFor ?? undefined);
  const [minAge, setMinAge] = useState<string>(prefill?.minAge != null ? String(prefill.minAge) : "");
  const [maxAge, setMaxAge] = useState<string>(prefill?.maxAge != null ? String(prefill.maxAge) : "");
  const [cities, setCities] = useState<string[]>(prefill?.cities ?? []);
  const [anywhere, setAnywhere] = useState<boolean>(Boolean(prefill && !prefill.cities?.length && !prefill.states?.length));
  const [save, setSave] = useState(false);
  const [lastPrefill, setLastPrefill] = useState(prefill);

  // A spoken answer arrives as new filters — adopt them into the three controls.
  if (prefill !== lastPrefill) {
    setLastPrefill(prefill);
    if (prefill) {
      if (prefill.lookingForGender) setGender(prefill.lookingForGender);
      if (prefill.minAge != null) setMinAge(String(prefill.minAge));
      if (prefill.maxAge != null) setMaxAge(String(prefill.maxAge));
      if (prefill.cities?.length) {
        setCities(prefill.cities);
        setAnywhere(false);
      }
    }
  }

  const lo = minAge ? Number(minAge) : undefined;
  const hi = maxAge ? Number(maxAge) : undefined;
  const ageOk = (lo == null || (lo >= DISCOVER_MIN_AGE && lo <= DISCOVER_MAX_AGE)) && (hi == null || (hi >= DISCOVER_MIN_AGE && hi <= DISCOVER_MAX_AGE)) && (lo == null || hi == null || lo <= hi);
  const answered = Boolean(gender) && (lo != null || hi != null) && ageOk && (anywhere || cities.length > 0);
  const listening = voice.state === "listening";

  function toggleCity(c: string) {
    setAnywhere(false);
    setCities((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }

  function start() {
    const filters: DiscoverFilters = { lookingForGender: gender };
    if (lo != null) filters.minAge = lo;
    if (hi != null) filters.maxAge = hi;
    if (!anywhere && cities.length) filters.cities = cities;
    onStart(filters, save);
  }

  const cityChips = [...new Set([...(viewerCity ? [viewerCity] : []), ...POPULAR_CITIES])].slice(0, 9);

  return (
    <Card variant="luxe" padding="md" className="space-y-4">
      <div>
        <p className="text-[0.9375rem] font-semibold text-ink">{t("discover.setup.title", "Aapki search preference abhi set nahi hai.")}</p>
        <p className="mt-0.5 text-[0.8125rem] text-muted">{t("discover.setup.subtitle", "Search shuru karne ke liye 3 cheezein batayein — ya mic dabaakar ek line me bol dein.")}</p>
      </div>

      {voice.supported && (
        <button
          type="button"
          onClick={() => (listening ? voice.stop() : void voice.start())}
          disabled={busy || locked}
          aria-pressed={listening}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[0.875rem] font-semibold transition-colors disabled:opacity-50",
            listening ? "border-accent bg-accent text-accent-fg" : "border-gold-300/70 bg-gold-50 text-gold-700 hover:border-gold-500 dark:bg-gold-900/30 dark:text-gold-200",
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
          {listening ? t("discover.setup.listening", "Sun rahe hain… (jaise: Jaipur ya Delhi ki 25 se 29 saal ki ladki)") : t("discover.setup.speak", "Bol kar batayein")}
        </button>
      )}

      <fieldset>
        <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">1. {t("discover.setup.q1", "Kis tarah ka rishta dhoondh rahe hain?")}</legend>
        <div className="flex gap-1.5" role="radiogroup">
          {GENDER_VALUES.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={gender === g}
              onClick={() => setGender(g)}
              className={cn("h-10 rounded-full border px-4 text-[0.875rem] font-medium", gender === g ? "border-gold-500 bg-gold-50 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200" : "border-line bg-surface text-muted")}
            >
              {g === "Ladki" ? t("discover.setup.ladki", "Ladki (bride)") : t("discover.setup.ladka", "Ladka (groom)")}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">2. {t("discover.setup.q2", "Age range?")}</legend>
        <div className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min={DISCOVER_MIN_AGE} max={DISCOVER_MAX_AGE} value={minAge} onChange={(e) => setMinAge(e.target.value)} aria-label={t("discover.f.minAge", "Min age")} placeholder="25" className="h-10 w-24 rounded-md border border-line-strong bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-gold-500" />
          <span className="text-muted">–</span>
          <input type="number" inputMode="numeric" min={DISCOVER_MIN_AGE} max={DISCOVER_MAX_AGE} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} aria-label={t("discover.f.maxAge", "Max age")} placeholder="30" className="h-10 w-24 rounded-md border border-line-strong bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-gold-500" />
          <span className="text-[0.8125rem] text-muted">{t("discover.setup.years", "saal")}</span>
        </div>
        {!ageOk && <p className="mt-1 text-[0.75rem] text-danger">{t("discover.setup.ageError", "Age 18–80 ke beech ho aur min, max se chhoti ho.")}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">3. {t("discover.setup.q3", "Location — kahan ki profiles?")}</legend>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={anywhere}
            onClick={() => {
              setAnywhere(true);
              setCities([]);
            }}
            className={cn("h-9 rounded-full border px-3 text-[0.8125rem] font-medium", anywhere ? "border-gold-500 bg-gold-50 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200" : "border-line bg-surface text-muted")}
          >
            {ANYWHERE}
          </button>
          {cityChips.map((c) => (
            <button key={c} type="button" aria-pressed={cities.includes(c)} onClick={() => toggleCity(c)} className={cn("h-9 rounded-full border px-3 text-[0.8125rem] font-medium", cities.includes(c) ? "border-gold-500 bg-gold-50 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200" : "border-line bg-surface text-muted")}>
              {c === viewerCity ? `${c} (${t("discover.setup.myCity", "aapka sheher")})` : c}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[0.75rem] text-subtle">{t("discover.setup.moreCities", "Aur sheher baad me Filters se jod sakte hain.")}</p>
      </fieldset>

      <label className="flex items-start gap-2 text-[0.8125rem] text-muted">
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span>{t("discover.setup.saveLabel", "Isse meri preference me bhi save karein (Reel aur match-fit isi se chalte hain). Bina tick ke ye sirf is search ke liye hai.")}</span>
      </label>

      <button
        type="button"
        onClick={start}
        disabled={!answered || busy || locked}
        className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-[0.875rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        <Search className="size-4" aria-hidden />
        {t("discover.setup.start", "Search shuru karein")}
      </button>
    </Card>
  );
}
