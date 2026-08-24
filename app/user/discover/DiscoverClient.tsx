"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, Lock, Search, Sparkles, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

type FilterMode = "FLEXIBLE" | "STRICT";

interface SettingsDto {
  filterMode: FilterMode;
  verifiedOnly: boolean;
  minTrustScore: number | null;
  behaviorLearningEnabled: boolean;
  hasBeenReset: boolean;
  updatedAt: string;
}

interface BehaviorSummary {
  state: "paused" | "collecting" | "active";
  sampleSize: number;
  positiveCount: number;
  topCities: string[];
  topAgeBands: string[];
  topEducation: string[];
}

interface PartnerPreferences {
  lookingForGender: string | null;
  minAge: number | null;
  maxAge: number | null;
  preferredCities: string[];
  educationPreference: string | null;
  maritalStatusPreference: string | null;
}

interface SearchResult {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  professionCategory: string | null;
  maritalStatus: string | null;
  trustScore: number | null;
  photoUrl: string | null;
  photoUnlocked: boolean;
  photoVerified: boolean;
}

const MIN_DECISIONS = 20;

export default function DiscoverClient({
  entitled: initialEntitled,
  initialSettings,
  partnerPreferences,
}: {
  entitled: boolean;
  initialSettings: SettingsDto;
  partnerPreferences: PartnerPreferences | null;
}) {
  const t = useT();
  const { toast } = useToast();

  const [entitled, setEntitled] = useState(initialEntitled);
  const [settings, setSettings] = useState(initialSettings);
  const [behavior, setBehavior] = useState<BehaviorSummary | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  // Ad-hoc search filters — never persisted, scoped to this search only.
  const [name, setName] = useState("");
  const [minAge, setMinAge] = useState(partnerPreferences?.minAge?.toString() ?? "");
  const [maxAge, setMaxAge] = useState(partnerPreferences?.maxAge?.toString() ?? "");
  const [cities, setCities] = useState(partnerPreferences?.preferredCities?.join(", ") ?? "");
  const [education, setEducation] = useState("");
  const [professionCategory, setProfessionCategory] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [verifiedOnlySearch, setVerifiedOnlySearch] = useState(false);
  const [minTrustSearch, setMinTrustSearch] = useState("");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    fetch("/api/discover/settings")
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) return;
        setEntitled(json.entitled);
        setSettings(json.settings);
        setBehavior(json.behavior);
      })
      .catch(() => {});
  }, []);

  function buildQuery(nextCursor: string | null): string {
    const params = new URLSearchParams();
    if (name.trim()) params.set("name", name.trim());
    if (minAge) params.set("minAge", minAge);
    if (maxAge) params.set("maxAge", maxAge);
    if (cities.trim()) params.set("cities", cities.split(",").map((c) => c.trim()).filter(Boolean).join(","));
    if (education.trim()) params.set("education", education.trim());
    if (professionCategory.trim()) params.set("professionCategory", professionCategory.trim());
    if (maritalStatus.trim()) params.set("maritalStatus", maritalStatus.trim());
    if (verifiedOnlySearch) params.set("verifiedOnly", "true");
    if (minTrustSearch) params.set("minTrustScore", minTrustSearch);
    if (nextCursor) params.set("cursor", nextCursor);
    return params.toString();
  }

  async function runSearch(nextCursor: string | null = null) {
    if (!entitled) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/discover/search?${buildQuery(nextCursor)}`);
      const json = await res.json();
      if (!json.ok) {
        setError(json.message ?? t("discover.searchFailed", "Search fail hui — dobara try karein."));
        return;
      }
      setResults((prev) => (nextCursor ? [...prev, ...json.results] : json.results));
      setCursor(json.nextCursor);
    } catch {
      setError(t("discover.networkError", "Network error — dobara try karein."));
    } finally {
      setLoading(false);
    }
  }

  async function patchSettings(patch: Partial<SettingsDto> | { action: "resetLearnedBehavior" }) {
    setSettingsBusy(true);
    try {
      const res = await fetch("/api/discover/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.ok) {
        toast({ title: t("discover.settingsFailed", "Save nahi hua"), description: json.message, tone: "error" });
        return;
      }
      setSettings(json.settings);
      toast({
        title: t("discover.settingsSaved", "Save ho gaya"),
        description: t("discover.settingsAppliesNext", "Ye agle Reel generation se lagu hoga — aaj ka Reel nahi badlega."),
        tone: "success",
      });
    } catch {
      toast({ title: t("discover.networkError", "Network error — dobara try karein."), tone: "error" });
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {!entitled && (
        <Card variant="soft" padding="md">
          <div className="flex items-center gap-3">
            <Lock className="size-5 shrink-0 text-wine-700" />
            <div className="min-w-0">
              <p className="text-[0.875rem] font-semibold text-ink">
                {t("discover.lockedTitle", "Advanced Discovery paid plan me khulta hai")}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                {t(
                  "discover.lockedBody",
                  "Filters neeche dikh rahe hain taaki aap dekh sakein ye kaam kaise karta hai — search chalane aur results dekhne ke liye plan upgrade karein.",
                )}
              </p>
              <Link
                href="/user/subscription"
                className="mt-2 inline-flex h-9 items-center rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-4 text-[0.8125rem] font-semibold text-primary-fg shadow-gold"
              >
                {t("discover.upgrade", "View Plans")}
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* ── Reel & pool settings — persisted, applies to the next Reel ────── */}
      <Card variant="default" padding="md">
        <h2 className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink">
          <Sparkles className="size-4 text-wine-700" />
          {t("discover.reelControlsTitle", "Smart Reel Controls")}
        </h2>
        <p className="mt-1 text-[0.75rem] leading-snug text-subtle">
          {t(
            "discover.reelControlsSubtitle",
            "Ye settings AAJ ke Reel ko nahi badalti — agle din/agle generation se lagu hongi.",
          )}
        </p>

        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-medium text-ink">{t("discover.filterMode", "Filter mode")}</p>
              <p className="text-[0.75rem] text-muted">
                {settings.filterMode === "STRICT"
                  ? t("discover.strictHint", "STRICT — pool kabhi widen nahi hota, kam rishtey mil sakte hain.")
                  : t("discover.flexibleHint", "FLEXIBLE — pool chhota ho to age preference thodi dheeli ho jaati hai.")}
              </p>
            </div>
            <div className="flex shrink-0 overflow-hidden rounded-full border border-line-strong">
              {(["FLEXIBLE", "STRICT"] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={!entitled || settingsBusy}
                  onClick={() => patchSettings({ filterMode: mode })}
                  className={cn(
                    "px-3 py-1.5 text-[0.75rem] font-semibold transition-colors disabled:opacity-50",
                    settings.filterMode === mode ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:bg-bg-subtle",
                  )}
                >
                  {mode === "FLEXIBLE" ? t("discover.flexible", "Flexible") : t("discover.strict", "Strict")}
                </button>
              ))}
            </div>
          </div>

          <ToggleRow
            label={t("discover.verifiedOnlyPool", "Sirf verified profiles (Reel pool)")}
            checked={settings.verifiedOnly}
            disabled={!entitled || settingsBusy}
            onChange={(v) => patchSettings({ verifiedOnly: v })}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.8125rem] font-medium text-ink">{t("discover.minTrustPool", "Minimum trust score (Reel pool)")}</p>
            <input
              type="number"
              min={0}
              max={100}
              disabled={!entitled || settingsBusy}
              defaultValue={settings.minTrustScore ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                patchSettings({ minTrustScore: v ? Math.min(100, Math.max(0, Number(v))) : null });
              }}
              placeholder={t("discover.none", "Koi nahi")}
              className="h-9 w-24 rounded-md border border-line-strong bg-surface px-2 text-center text-[0.8125rem] text-ink outline-none focus:border-gold-500 disabled:opacity-50"
            />
          </div>

          <div className="border-t border-line pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-medium text-ink">{t("discover.behaviorLearning", "Behaviour learning")}</p>
                <p className="text-[0.75rem] leading-snug text-muted">
                  {behavior
                    ? behaviorSentence(behavior, t)
                    : t("discover.behaviorLoading", "Load ho raha hai...")}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!entitled || settingsBusy}
                onClick={() => patchSettings({ behaviorLearningEnabled: !settings.behaviorLearningEnabled })}
                className="h-8 rounded-full border border-line-strong px-3 text-[0.75rem] font-semibold text-ink transition-colors hover:border-gold-500 hover:bg-gold-50 disabled:opacity-50 dark:hover:bg-gold-900/30"
              >
                {settings.behaviorLearningEnabled ? t("discover.pauseLearning", "Pause learning") : t("discover.resumeLearning", "Resume learning")}
              </button>
              <button
                type="button"
                disabled={!entitled || settingsBusy}
                onClick={() => patchSettings({ action: "resetLearnedBehavior" })}
                className="h-8 rounded-full border border-line px-3 text-[0.75rem] font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
              >
                {t("discover.resetLearning", "Reset learned behaviour")}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Ad-hoc search — never persisted, scoped to this query only ───── */}
      <Card variant="default" padding="md">
        <h2 className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink">
          <Search className="size-4 text-wine-700" />
          {t("discover.searchTitle", "Search")}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <TextField label={t("discover.name", "Name")} value={name} onChange={setName} span2 />
          <TextField label={t("discover.minAge", "Min age")} value={minAge} onChange={setMinAge} type="number" />
          <TextField label={t("discover.maxAge", "Max age")} value={maxAge} onChange={setMaxAge} type="number" />
          <TextField label={t("discover.cities", "Cities (comma sep.)")} value={cities} onChange={setCities} span2 />
          <TextField label={t("discover.education", "Education")} value={education} onChange={setEducation} />
          <TextField label={t("discover.professionCategory", "Profession category")} value={professionCategory} onChange={setProfessionCategory} />
          <TextField label={t("discover.maritalStatus", "Marital status")} value={maritalStatus} onChange={setMaritalStatus} />
          <TextField label={t("discover.minTrust", "Min trust")} value={minTrustSearch} onChange={setMinTrustSearch} type="number" />
        </div>
        <div className="mt-2.5">
          <ToggleRow
            label={t("discover.verifiedOnlySearch", "Sirf verified profiles")}
            checked={verifiedOnlySearch}
            onChange={setVerifiedOnlySearch}
          />
        </div>
        <button
          type="button"
          disabled={!entitled || loading}
          onClick={() => runSearch(null)}
          className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-[0.8125rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" />}
          {t("discover.search", "Search")}
        </button>
      </Card>

      {error && (
        <p className="text-[0.8125rem] text-danger" role="alert">
          {error}
        </p>
      )}

      {searched && entitled && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {results.map((r) => (
            <ResultCard key={r.profileId} r={r} />
          ))}
          {results.length === 0 && !loading && (
            <p className="col-span-full py-6 text-center text-[0.875rem] text-muted">
              {t("discover.noResults", "Is filter se koi profile nahi mili — filters badal kar dekhein.")}
            </p>
          )}
        </div>
      )}

      {searched && entitled && cursor && (
        <button
          type="button"
          disabled={loading}
          onClick={() => runSearch(cursor)}
          className="mx-auto flex h-10 items-center gap-1.5 rounded-full border border-line-strong px-5 text-[0.8125rem] font-semibold text-ink transition-colors hover:border-gold-500 disabled:opacity-50"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" />}
          {t("discover.loadMore", "Load more")}
        </button>
      )}
    </div>
  );
}

function behaviorSentence(b: BehaviorSummary, t: (k: string, f: string) => string): string {
  if (b.state === "paused") return t("discover.behaviorPaused", "Abhi paused hai — swipes se kuch nahi seekha ja raha.");
  if (b.state === "collecting") {
    return `${t("discover.behaviorCollectingPre", "Seekhna shuru nahi hua — ")}${b.sampleSize}/${MIN_DECISIONS} ${t("discover.behaviorCollectingPost", "decisions ho chuke hain.")}`;
  }
  const bits = [...b.topCities, ...b.topAgeBands].slice(0, 3);
  return bits.length > 0
    ? `${t("discover.behaviorActivePre", "Aapka Reel in cheezon se seekh raha hai: ")}${bits.join(", ")}.`
    : t("discover.behaviorActiveGeneric", "Aapka Reel aapke shortlist/interest patterns se seekh raha hai.");
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  span2 = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  span2?: boolean;
}) {
  return (
    <label className={cn("block", span2 && "col-span-2")}>
      <span className="mb-1 block text-[0.6875rem] font-medium text-subtle">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[0.8125rem] text-ink outline-none focus:border-gold-500"
      />
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[0.8125rem] font-medium text-ink">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary disabled:opacity-50"
      />
    </label>
  );
}

function ResultCard({ r }: { r: SearchResult }) {
  const t = useT();
  return (
    <Card variant="default" padding="md">
      <div className="flex gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-wine-100 via-gold-100 to-sand-200 dark:from-wine-900 dark:via-gold-900 dark:to-sand-800">
          {r.photoUnlocked && r.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL, not build-known
            <img src={r.photoUrl} alt={r.displayName} className="size-full object-cover" />
          ) : (
            <>
              <span aria-hidden className="absolute inset-0 grid place-items-center font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700/50 dark:text-gold-100/40">
                {r.displayName.trim().charAt(0).toUpperCase()}
              </span>
              <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-surface/85 backdrop-blur-sm">
                <Lock className="size-3 text-muted" />
              </span>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/user/profile/${r.profileId}`} className="truncate font-semibold text-ink transition-colors hover:text-primary-text">
              {r.displayName}
              {r.age ? `, ${r.age}` : ""}
            </Link>
            {r.photoVerified && <BadgeCheck className="size-4 shrink-0 text-trust" />}
            {r.trustScore != null && (
              <Pill tone="trust" size="sm">
                <ShieldCheck className="mr-0.5 inline size-3" />
                {r.trustScore}
              </Pill>
            )}
          </div>
          <p className="mt-0.5 truncate text-[0.8125rem] text-muted">
            {[r.city, r.education].filter(Boolean).join(" · ") || t("discover.detailsNotFilled", "Details nahi bhari")}
          </p>
          {r.professionCategory && <p className="truncate text-[0.8125rem] text-muted">{r.professionCategory}</p>}
        </div>
      </div>
    </Card>
  );
}
