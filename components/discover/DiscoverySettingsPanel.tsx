"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

type FilterMode = "FLEXIBLE" | "STRICT";

export interface SettingsDto {
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
  /** Served by the API from `MIN_DECISIONS`/`MIN_POSITIVE` — never hard-coded here, so "12/20" moves the day the learner does. */
  threshold?: { decisions: number; positive: number };
}

/**
 * The old "Smart Reel Controls", demoted to a collapsed panel at the bottom of
 * the page — they shape tomorrow's Reel, not this search, and the search is
 * what the page is for. The settings fetch runs only when the panel is opened
 * (or when a search needs the behaviour summary), so the first paint never
 * waits on it.
 */
export default function DiscoverySettingsPanel({ entitled, initialSettings }: { entitled: boolean; initialSettings: SettingsDto }) {
  const t = useT();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(initialSettings);
  const [behavior, setBehavior] = useState<BehaviorSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    fetch("/api/discover/settings")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        setSettings(json.settings);
        setBehavior(json.behavior);
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  async function patch(body: Partial<SettingsDto> | { action: "resetLearnedBehavior" }) {
    setBusy(true);
    try {
      const res = await fetch("/api/discover/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.ok) {
        toast({ title: t("discover.settingsFailed", "Save nahi hua"), description: json.message, tone: "error" });
        return;
      }
      setSettings(json.settings);
      setLoaded(false); // refresh the behaviour summary on next open
      toast({
        title: t("discover.settingsSaved", "Save ho gaya"),
        description: t("discover.settingsAppliesNext", "Ye agle Reel generation se lagu hoga — aaj ka Reel nahi badlega."),
        tone: "success",
      });
    } catch {
      toast({ title: t("discover.networkError", "Network error — dobara try karein."), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="discover-settings-body"
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        >
          <span className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink">
            <Sparkles className="size-4 text-wine-700" aria-hidden />
            {t("discover.settings.title", "Reel aur recommendation settings")}
          </span>
          <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </h2>

      <div id="discover-settings-body" hidden={!open} className="space-y-3 border-t border-line px-4 pb-4 pt-3">
        <p className="text-[0.75rem] leading-snug text-subtle">
          {t("discover.reelControlsSubtitle", "Ye settings AAJ ke Reel ko nahi badalti — agle din/agle generation se lagu hongi.")}
        </p>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-ink">{t("discover.filterMode", "Reel filter mode")}</p>
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
                disabled={!entitled || busy}
                onClick={() => patch({ filterMode: mode })}
                className={cn("px-3 py-1.5 text-[0.75rem] font-semibold transition-colors disabled:opacity-50", settings.filterMode === mode ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:bg-bg-subtle")}
              >
                {mode === "FLEXIBLE" ? t("discover.flexible", "Flexible") : t("discover.strict", "Strict")}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3">
          <span className="text-[0.8125rem] font-medium text-ink">{t("discover.verifiedOnlyPool", "Sirf verified profiles (Reel pool)")}</span>
          <input type="checkbox" checked={settings.verifiedOnly} disabled={!entitled || busy} onChange={(e) => patch({ verifiedOnly: e.target.checked })} className="size-4 accent-primary disabled:opacity-50" />
        </label>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.8125rem] font-medium text-ink">{t("discover.minTrustPool", "Minimum trust score (Reel pool)")}</p>
          <input
            type="number"
            min={0}
            max={100}
            disabled={!entitled || busy}
            defaultValue={settings.minTrustScore ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              patch({ minTrustScore: v ? Math.min(100, Math.max(0, Number(v))) : null });
            }}
            placeholder={t("discover.none", "Koi nahi")}
            aria-label={t("discover.minTrustPool", "Minimum trust score (Reel pool)")}
            className="h-9 w-24 rounded-md border border-line-strong bg-surface px-2 text-center text-[0.8125rem] text-ink outline-none focus:border-gold-500 disabled:opacity-50"
          />
        </div>

        <div className="border-t border-line pt-3">
          <p className="text-[0.8125rem] font-medium text-ink">{t("discover.behaviorLearning", "Behaviour learning")}</p>
          <p className="text-[0.75rem] leading-snug text-muted">
            {!loaded && open ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" aria-hidden /> {t("discover.behaviorLoading", "Load ho raha hai...")}
              </span>
            ) : behavior ? (
              behaviorSentence(behavior, t)
            ) : (
              t("discover.behaviorLocked", "Paid plan me khulta hai.")
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!entitled || busy}
              onClick={() => patch({ behaviorLearningEnabled: !settings.behaviorLearningEnabled })}
              className="h-9 rounded-full border border-line-strong px-3 text-[0.75rem] font-semibold text-ink transition-colors hover:border-gold-500 hover:bg-gold-50 disabled:opacity-50 dark:hover:bg-gold-900/30"
            >
              {settings.behaviorLearningEnabled ? t("discover.pauseLearning", "Pause learning") : t("discover.resumeLearning", "Resume learning")}
            </button>
            <button
              type="button"
              disabled={!entitled || busy}
              onClick={() => patch({ action: "resetLearnedBehavior" })}
              className="h-9 rounded-full border border-line px-3 text-[0.75rem] font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
            >
              {t("discover.resetLearning", "Reset learned behaviour")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function behaviorSentence(b: BehaviorSummary, t: (k: string, f: string) => string): string {
  if (b.state === "paused") return t("discover.behaviorPaused", "Abhi paused hai — swipes se kuch nahi seekha ja raha.");
  if (b.state === "collecting") {
    return `${t("discover.behaviorCollectingPre", "Seekhna shuru nahi hua — ")}${b.sampleSize}/${b.threshold?.decisions ?? "?"} ${t("discover.behaviorCollectingPost", "decisions ho chuke hain.")}`;
  }
  const bits = [...b.topCities, ...b.topAgeBands].slice(0, 3);
  return bits.length > 0
    ? `${t("discover.behaviorActivePre", "Aapka Reel in cheezon se seekh raha hai: ")}${bits.join(", ")}.`
    : t("discover.behaviorActiveGeneric", "Aapka Reel aapke shortlist/interest patterns se seekh raha hai.");
}
