"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Lock, Search, X } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import { HEIGHT_VALUES, POPULAR_CITIES, searchCities } from "@/lib/profile/quickPicks";
import {
  COMMUNITY_VALUES,
  COUNTRY_VALUES,
  DIET_VALUES,
  DISCOVER_MAX_AGE,
  DISCOVER_MIN_AGE,
  DISCOVER_NAME_MAX_CHARS,
  DRINKING_VALUES,
  EDUCATION_TIER_VALUES,
  EDUCATION_VALUES,
  FAMILY_TYPE_VALUES,
  FAMILY_VALUES_VALUES,
  FILTER_GROUP_LABELS,
  GENDER_VALUES,
  HOBBY_VALUES,
  INCOME_BUCKETS,
  LANGUAGE_VALUES,
  MANGLIK_VALUES,
  MARITAL_STATUS_VALUES,
  MOTHER_TONGUE_VALUES,
  PROFESSION_CATEGORY_VALUES,
  RELIGION_VALUES,
  RELOCATE_VALUES,
  SMOKING_VALUES,
  STATE_VALUES,
  countActiveFilters,
  parseDiscoverFilters,
  type DiscoverFilterGroup,
  type DiscoverFilters,
} from "@/lib/discovery/contract";

export interface DiscoverFilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: DiscoverFilters;
  onApply: (next: DiscoverFilters) => void;
  /** "Isi sheher me" resolves to this. */
  viewerCity?: string | null;
}

/** `md` breakpoint — the sheet slides up on a phone and in from the side on a desktop. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

function feetInchesToCm(value: string): number | null {
  const m = value.match(/^(\d+)'(\d{1,2})"$/);
  if (!m) return null;
  return Math.round((Number(m[1]) * 12 + Number(m[2])) * 2.54);
}

/** The height catalog as {label, cm} — the select shows feet/inches, the filter stores centimetres. */
const HEIGHT_OPTIONS = HEIGHT_VALUES.map((v) => ({ label: v, cm: feetInchesToCm(v) })).filter((o): o is { label: string; cm: number } => o.cm !== null);

/**
 * Every filter the catalog knows, grouped, behind one button. Progressive
 * disclosure inside: Basic is open, the rest fold, and a group with active
 * filters says how many. The draft is local until "Apply" — closing the sheet
 * discards edits, which is what a sheet full of half-changed controls should
 * do. Options render from `lib/discovery/contract.ts`, so the sheet cannot
 * offer a value the server would reject.
 */
export default function DiscoverFilterSheet({ open, onClose, filters, onApply, viewerCity }: DiscoverFilterSheetProps) {
  const t = useT();
  const desktop = useIsDesktop();
  const [draft, setDraft] = useState<DiscoverFilters>(filters);
  const [error, setError] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<DiscoverFilterGroup, boolean>>({
    basic: true, background: false, education: false, lifestyle: false, family: false, astrology: false, trust: false,
  });

  useEffect(() => {
    if (open) {
      setDraft(filters);
      setError(null);
    }
  }, [open, filters]);

  const set = <K extends keyof DiscoverFilters>(key: K, value: DiscoverFilters[K] | undefined) => {
    setDraft((d) => {
      const next = { ...d };
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  function apply() {
    const parsed = parseDiscoverFilters(draft);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    onApply(parsed.filters);
    onClose();
  }

  const count = countActiveFilters(draft);
  const groupCount = (keys: (keyof DiscoverFilters)[]) => keys.reduce((n, k) => n + (draft[k] === undefined ? 0 : Array.isArray(draft[k]) ? (draft[k] as string[]).length : 1), 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant={desktop ? "side" : "bottom"}
      title={t("discover.sheet.title", "Filters")}
      description={t("discover.sheet.description", "Sirf wahi lagte hain jo aap chunte hain — kuch bhi apne aap nahi.")}
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDraft({ lookingForGender: draft.lookingForGender })}
            className="h-11 rounded-full px-4 text-[0.875rem] font-medium text-muted transition-colors hover:text-danger"
          >
            {t("discover.sheet.reset", "Reset")}
          </button>
          <button
            type="button"
            onClick={apply}
            className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-[0.875rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            {t("discover.sheet.apply", "Apply")} {count > 0 && <span className="grid size-5 place-items-center rounded-full bg-surface/80 text-[0.6875rem] font-bold text-ink">{count}</span>}
          </button>
        </div>
      }
    >
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        {error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[0.8125rem] text-danger">
            {error}
          </p>
        )}

        <Group id="basic" label={FILTER_GROUP_LABELS.basic} open={openGroups.basic} onToggle={() => setOpenGroups((g) => ({ ...g, basic: !g.basic }))} count={groupCount(["lookingForGender", "name", "minAge", "maxAge", "minHeightCm", "maxHeightCm", "cities", "states", "countries", "nativePlace", "maritalStatus"])}>
          <ChipSingle label={t("discover.f.lookingFor", "Looking for")} options={GENDER_VALUES} value={draft.lookingForGender} onChange={(v) => set("lookingForGender", v as DiscoverFilters["lookingForGender"])} />
          <TextField label={t("discover.f.name", "Name")} value={draft.name ?? ""} onChange={(v) => set("name", v)} placeholder={t("discover.f.namePh", "Jaise: Neha")} maxLength={DISCOVER_NAME_MAX_CHARS} hint={t("discover.f.nameHint", "Kam se kam 2 letters — naam ka hissa bhi chalega.")} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={t("discover.f.minAge", "Min age")} value={draft.minAge} min={DISCOVER_MIN_AGE} max={DISCOVER_MAX_AGE} onChange={(v) => set("minAge", v)} />
            <NumberField label={t("discover.f.maxAge", "Max age")} value={draft.maxAge} min={DISCOVER_MIN_AGE} max={DISCOVER_MAX_AGE} onChange={(v) => set("maxAge", v)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField label={t("discover.f.minHeight", "Min height")} value={draft.minHeightCm != null ? String(draft.minHeightCm) : ""} onChange={(v) => set("minHeightCm", v ? Number(v) : undefined)} options={HEIGHT_OPTIONS.map((h) => ({ value: String(h.cm), label: h.label }))} />
            <SelectField label={t("discover.f.maxHeight", "Max height")} value={draft.maxHeightCm != null ? String(draft.maxHeightCm) : ""} onChange={(v) => set("maxHeightCm", v ? Number(v) : undefined)} options={HEIGHT_OPTIONS.map((h) => ({ value: String(h.cm), label: h.label }))} />
          </div>
          <PlacePicker label={t("discover.f.city", "Current city")} values={draft.cities ?? []} onChange={(v) => set("cities", v)} viewerCity={viewerCity} />
          <ChipMulti label={t("discover.f.state", "State")} options={STATE_VALUES.filter((s) => s !== "Outside India")} values={draft.states ?? []} onChange={(v) => set("states", v)} collapsible />
          <ChipMulti label={t("discover.f.country", "Country")} options={COUNTRY_VALUES} values={draft.countries ?? []} onChange={(v) => set("countries", v)} collapsible />
          <TextField label={t("discover.f.native", "Native place")} value={draft.nativePlace ?? ""} onChange={(v) => set("nativePlace", v)} placeholder={t("discover.f.nativePh", "Jaise: Sikar")} />
          <ChipMulti label={t("discover.f.marital", "Marital status")} options={MARITAL_STATUS_VALUES} values={draft.maritalStatus ?? []} onChange={(v) => set("maritalStatus", v)} />
        </Group>

        <Group id="background" label={FILTER_GROUP_LABELS.background} open={openGroups.background} onToggle={() => setOpenGroups((g) => ({ ...g, background: !g.background }))} count={groupCount(["motherTongue", "religion", "community", "gotra"])}>
          <ChipMulti label={t("discover.f.motherTongue", "Mother tongue")} options={MOTHER_TONGUE_VALUES} values={draft.motherTongue ?? []} onChange={(v) => set("motherTongue", v)} />
          <SensitiveNote />
          <ChipMulti label={t("discover.f.religion", "Religion")} options={RELIGION_VALUES} values={draft.religion ?? []} onChange={(v) => set("religion", v)} sensitive />
          <ComboMulti label={t("discover.f.community", "Caste / Community")} suggestions={COMMUNITY_VALUES} values={draft.community ?? []} onChange={(v) => set("community", v)} placeholder={t("discover.f.communityPh", "Jaise: Agarwal")} sensitive />
          <TextField label={t("discover.f.gotra", "Gotra")} value={draft.gotra ?? ""} onChange={(v) => set("gotra", v)} maxLength={40} sensitive />
        </Group>

        <Group id="education" label={FILTER_GROUP_LABELS.education} open={openGroups.education} onToggle={() => setOpenGroups((g) => ({ ...g, education: !g.education }))} count={groupCount(["educationTier", "education", "professionCategory", "jobTitle", "workCity", "minIncome"])}>
          <ChipSingle label={t("discover.f.educationTier", "Highest education")} options={EDUCATION_TIER_VALUES} value={draft.educationTier} onChange={(v) => set("educationTier", v)} />
          <ChipMulti label={t("discover.f.degree", "Degree")} options={EDUCATION_VALUES} values={draft.education ?? []} onChange={(v) => set("education", v)} collapsible />
          <ChipMulti label={t("discover.f.profession", "Profession")} options={PROFESSION_CATEGORY_VALUES} values={draft.professionCategory ?? []} onChange={(v) => set("professionCategory", v)} collapsible />
          <TextField label={t("discover.f.jobTitle", "Job title")} value={draft.jobTitle ?? ""} onChange={(v) => set("jobTitle", v)} placeholder={t("discover.f.jobTitlePh", "Jaise: Software Engineer")} />
          <PlacePicker label={t("discover.f.workCity", "Work city")} values={draft.workCity ?? []} onChange={(v) => set("workCity", v)} />
          <SensitiveNote />
          <ChipSingle label={t("discover.f.minIncome", "Minimum income")} options={INCOME_BUCKETS} value={draft.minIncome} onChange={(v) => set("minIncome", v)} sensitive />
        </Group>

        <Group id="lifestyle" label={FILTER_GROUP_LABELS.lifestyle} open={openGroups.lifestyle} onToggle={() => setOpenGroups((g) => ({ ...g, lifestyle: !g.lifestyle }))} count={groupCount(["diet", "smoking", "drinking", "languages", "hobbies", "relocate"])}>
          <ChipMulti label={t("discover.f.diet", "Diet")} options={DIET_VALUES} values={draft.diet ?? []} onChange={(v) => set("diet", v)} />
          <ChipMulti label={t("discover.f.smoking", "Smoking")} options={SMOKING_VALUES} values={draft.smoking ?? []} onChange={(v) => set("smoking", v)} />
          <ChipMulti label={t("discover.f.drinking", "Drinking")} options={DRINKING_VALUES} values={draft.drinking ?? []} onChange={(v) => set("drinking", v)} />
          <ChipMulti label={t("discover.f.languages", "Languages known")} options={LANGUAGE_VALUES} values={draft.languages ?? []} onChange={(v) => set("languages", v)} collapsible />
          <ChipMulti label={t("discover.f.hobbies", "Hobbies")} options={HOBBY_VALUES} values={draft.hobbies ?? []} onChange={(v) => set("hobbies", v)} collapsible />
          <ChipMulti label={t("discover.f.relocate", "Relocation")} options={RELOCATE_VALUES} values={draft.relocate ?? []} onChange={(v) => set("relocate", v)} />
        </Group>

        <Group id="family" label={FILTER_GROUP_LABELS.family} open={openGroups.family} onToggle={() => setOpenGroups((g) => ({ ...g, family: !g.family }))} count={groupCount(["familyType", "familyValues"])}>
          <ChipMulti label={t("discover.f.familyType", "Family type")} options={FAMILY_TYPE_VALUES} values={draft.familyType ?? []} onChange={(v) => set("familyType", v)} />
          <ChipMulti label={t("discover.f.familyValues", "Family values")} options={FAMILY_VALUES_VALUES} values={draft.familyValues ?? []} onChange={(v) => set("familyValues", v)} />
        </Group>

        <Group id="astrology" label={FILTER_GROUP_LABELS.astrology} open={openGroups.astrology} onToggle={() => setOpenGroups((g) => ({ ...g, astrology: !g.astrology }))} count={groupCount(["manglik"])}>
          <SensitiveNote />
          <ChipMulti label={t("discover.f.manglik", "Manglik status")} options={MANGLIK_VALUES} values={draft.manglik ?? []} onChange={(v) => set("manglik", v)} sensitive />
          <p className="text-[0.75rem] text-subtle">{t("discover.f.astroNote", "Baaki kundli details kisi ko nahi dikhti aur search me nahi aati — sirf Kundli Match tool me, dono taraf ki sehmati se.")}</p>
        </Group>

        <Group id="trust" label={FILTER_GROUP_LABELS.trust} open={openGroups.trust} onToggle={() => setOpenGroups((g) => ({ ...g, trust: !g.trust }))} count={groupCount(["verifiedOnly", "minTrustScore", "minCompleteness"])}>
          <label className="flex items-center justify-between gap-3 py-1">
            <span className="text-[0.875rem] text-ink">{t("discover.f.verifiedOnly", "Sirf verified profiles")}</span>
            <input type="checkbox" checked={Boolean(draft.verifiedOnly)} onChange={(e) => set("verifiedOnly", e.target.checked || undefined)} className="size-5 accent-primary" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={t("discover.f.minTrust", "Min trust score")} value={draft.minTrustScore} min={0} max={100} onChange={(v) => set("minTrustScore", v)} />
            <NumberField label={t("discover.f.minCompleteness", "Min profile %")} value={draft.minCompleteness} min={0} max={100} onChange={(v) => set("minCompleteness", v)} />
          </div>
        </Group>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Group({ id, label, open, onToggle, count, children }: { id: string; label: string; open: boolean; onToggle: () => void; count: number; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line">
      <h4>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`discover-group-${id}`}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left text-[0.875rem] font-semibold text-ink"
        >
          <span className="flex items-center gap-2">
            {label}
            {count > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-fg">{count}</span>}
          </span>
          <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </h4>
      <div id={`discover-group-${id}`} hidden={!open} className="space-y-3 px-3.5 pb-3.5">
        {children}
      </div>
    </section>
  );
}

function FieldLabel({ children, sensitive }: { children: ReactNode; sensitive?: boolean }) {
  return (
    <span className="mb-1.5 flex items-center gap-1 text-[0.75rem] font-medium text-subtle">
      {children}
      {sensitive && <Lock className="size-3 text-wine-700" aria-hidden />}
    </span>
  );
}

function SensitiveNote() {
  const t = useT();
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-wine-50 px-2.5 py-1.5 text-[0.75rem] leading-snug text-wine-700 dark:bg-wine-900/30 dark:text-wine-200">
      <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
      {t("discover.f.sensitiveNote", "🔒 wale filters sirf un profiles par lagte hain jinhone ye field khud bhari hai aur usse dhoondhe jaane ki permission di hai.")}
    </p>
  );
}

function chipClass(active: boolean) {
  return cn(
    "h-9 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors",
    active ? "border-gold-500 bg-gold-50 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
  );
}

function ChipMulti({ label, options, values, onChange, collapsible = false, sensitive = false }: { label: string; options: readonly string[]; values: string[]; onChange: (v: string[]) => void; collapsible?: boolean; sensitive?: boolean }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const shown = collapsible && !expanded ? options.filter((o) => values.includes(o) || options.indexOf(o) < 8) : options;
  return (
    <fieldset>
      <legend className="contents">
        <FieldLabel sensitive={sensitive}>{label}</FieldLabel>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((o) => {
          const active = values.includes(o);
          return (
            <button key={o} type="button" aria-pressed={active} onClick={() => onChange(active ? values.filter((v) => v !== o) : [...values, o])} className={chipClass(active)}>
              {o}
            </button>
          );
        })}
        {collapsible && shown.length < options.length && (
          <button type="button" onClick={() => setExpanded(true)} className="h-9 rounded-full px-3 text-[0.8125rem] font-medium text-wine-700 hover:underline">
            {t("discover.f.more", "+ aur")} {options.length - shown.length}
          </button>
        )}
      </div>
    </fieldset>
  );
}

function ChipSingle({ label, options, value, onChange, sensitive = false }: { label: string; options: readonly string[]; value: string | undefined; onChange: (v: string | undefined) => void; sensitive?: boolean }) {
  return (
    <fieldset>
      <legend className="contents">
        <FieldLabel sensitive={sensitive}>{label}</FieldLabel>
      </legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = value === o;
          return (
            <button key={o} type="button" role="radio" aria-checked={active} onClick={() => onChange(active ? undefined : o)} className={chipClass(active)}>
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function TextField({ label, value, onChange, placeholder, maxLength = 60, hint, sensitive = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; hint?: string; sensitive?: boolean }) {
  return (
    <label className="block">
      <FieldLabel sensitive={sensitive}>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-gold-500"
      />
      {hint && <span className="mt-1 block text-[0.6875rem] text-subtle">{hint}</span>}
    </label>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number | undefined; min: number; max: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) return onChange(undefined);
          const n = Math.round(Number(raw));
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined);
        }}
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-gold-500"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const t = useT();
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-line-strong bg-surface px-2 text-[0.875rem] text-ink outline-none focus:border-gold-500">
        <option value="">{t("discover.f.any", "Koi bhi")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Search-as-you-type over the city catalog plus the popular dozen as chips; selected cities show as removable chips. */
function PlacePicker({ label, values, onChange, viewerCity }: { label: string; values: string[]; onChange: (v: string[]) => void; viewerCity?: string | null }) {
  const t = useT();
  const [q, setQ] = useState("");
  const hits = useMemo(() => (q.trim().length >= 2 ? searchCities(q, 8).filter((h) => !values.includes(h.city)) : []), [q, values]);
  const add = (city: string) => {
    if (!values.includes(city)) onChange([...values, city]);
    setQ("");
  };
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {values.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {values.map((c) => (
            <span key={c} className="inline-flex h-8 items-center gap-1 rounded-full border border-gold-500 bg-gold-50 pl-3 pr-1 text-[0.8125rem] font-medium text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
              {c}
              <button type="button" onClick={() => onChange(values.filter((v) => v !== c))} aria-label={`${t("discover.chips.remove", "Remove")} ${c}`} className="grid size-6 place-items-center rounded-full hover:bg-surface/70">
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) {
              e.preventDefault();
              add(hits[0].city);
            }
          }}
          placeholder={t("discover.f.cityPh", "Sheher ka naam likhein…")}
          aria-label={label}
          aria-autocomplete="list"
          className="h-10 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-[0.875rem] text-ink outline-none focus:border-gold-500"
        />
        {hits.length > 0 && (
          <ul role="listbox" className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg">
            {hits.map((h) => (
              <li key={`${h.city}-${h.state}`} role="option" aria-selected={false}>
                <button type="button" onClick={() => add(h.city)} className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-[0.875rem] text-ink hover:bg-bg-subtle">
                  {h.city}
                  <span className="text-[0.75rem] text-subtle">{h.state}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {viewerCity && !values.includes(viewerCity) && (
          <button type="button" onClick={() => add(viewerCity)} className={chipClass(false)}>
            {t("discover.f.myCity", "Isi sheher me")} · {viewerCity}
          </button>
        )}
        {POPULAR_CITIES.filter((c) => !values.includes(c)).slice(0, 8).map((c) => (
          <button key={c} type="button" onClick={() => add(c)} className={chipClass(false)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Free text with suggestions — for the caste/community column, which is text in the profile too. */
function ComboMulti({ label, suggestions, values, onChange, placeholder, sensitive = false }: { label: string; suggestions: readonly string[]; values: string[]; onChange: (v: string[]) => void; placeholder?: string; sensitive?: boolean }) {
  const t = useT();
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k.length >= 2 ? suggestions.filter((s) => s.toLowerCase().includes(k) && !values.includes(s)).slice(0, 8) : [];
  }, [q, suggestions, values]);
  const add = (v: string) => {
    const clean = v.trim();
    if (clean.length >= 2 && !values.includes(clean)) onChange([...values, clean]);
    setQ("");
  };
  return (
    <div>
      <FieldLabel sensitive={sensitive}>{label}</FieldLabel>
      {values.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {values.map((c) => (
            <span key={c} className="inline-flex h-8 items-center gap-1 rounded-full border border-wine-200/70 bg-wine-50 pl-3 pr-1 text-[0.8125rem] font-medium text-wine-700 dark:border-wine-400/25 dark:bg-wine-900/40 dark:text-wine-200">
              {c}
              <button type="button" onClick={() => onChange(values.filter((v) => v !== c))} aria-label={`${t("discover.chips.remove", "Remove")} ${c}`} className="grid size-6 place-items-center rounded-full hover:bg-surface/70">
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(hits[0] ?? q);
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          maxLength={40}
          className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-gold-500"
        />
        {hits.length > 0 && (
          <ul role="listbox" className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg">
            {hits.map((h) => (
              <li key={h} role="option" aria-selected={false}>
                <button type="button" onClick={() => add(h)} className="w-full px-3 py-2 text-left text-[0.875rem] text-ink hover:bg-bg-subtle">
                  {h}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

