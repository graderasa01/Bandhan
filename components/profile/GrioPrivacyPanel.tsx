"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  EyeOff,
  Loader2,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import type { PrivacySnapshot } from "@/lib/services/grio/samajhMap";

/**
 * The Shield panel — "Grio mere baare me kya jaanta hai?"
 *
 * ## Grouped by origin, not by screen
 *
 * The obvious grouping is by where a fact is edited (profile, intelligence,
 * Vibe). That grouping answers "where do I change this", which is the second
 * question. The first one is "did I actually say this", and the honest answer
 * differs enormously across the list: a parent's answer, an AI's read of a
 * biodata, and a number derived from swipes are three different kinds of claim
 * that a screen ordered by edit-location would print side by side as equals.
 *
 * So every fact carries its provenance tag in the user's own words, straight
 * off `selfKnowledge`'s `KnowledgeSource`. The service resolves the wording;
 * this file only renders it.
 *
 * ## Why the controls sit here and not in Settings
 *
 * "Delete this memory" and "pause behaviour learning" already exist elsewhere.
 * Repeating them here is deliberate: a control shown next to the data it
 * governs is the only version a user can act on while the question is still in
 * their head. Both call the same endpoints the settings screens do — there is
 * no second write path, only a second place to reach the first one.
 */

const SOURCE_TONE: Record<string, string> = {
  DECLARED: "bg-trust-bg text-trust",
  CONFIRMED: "bg-trust-bg text-trust",
  VERIFIED: "bg-trust-bg text-trust",
  FAMILY_SAID: "bg-warn-bg text-warn",
  INFERRED: "bg-info-bg text-info",
  BEHAVIOURAL: "bg-info-bg text-info",
  UNKNOWN_SOURCE: "bg-bg-subtle text-muted",
};

export default function GrioPrivacyPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [data, setData] = useState<PrivacySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** Which control is mid-write, so two taps cannot race the same row. */
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/grio/samajh-map?section=privacy")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { ok: boolean; privacy: PrivacySnapshot }) => {
        if (!alive) return;
        setData(json.privacy);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function deleteMemory(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/grio/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        setData((d) => (d ? { ...d, memory: d.memory.filter((m) => m.id !== id) } : d));
      }
    } finally {
      setBusy(null);
    }
  }

  async function patchBehaviour(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/discover/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { settings: { behaviorLearningEnabled: boolean } };
      setData((d) =>
        d
          ? {
              ...d,
              behaviour: {
                ...d.behaviour,
                enabled: json.settings.behaviorLearningEnabled,
                // A reset drops the collected decisions from the *learner*, so
                // the panel must stop claiming the learner is active. Showing 0
                // is the honest state until the next swipe, and showing the old
                // count would be the one number here nobody could verify.
                ...(key === "reset" ? { active: false, decisions: 0 } : {}),
                ...(key === "toggle" && !json.settings.behaviorLearningEnabled ? { active: false } : {}),
              },
            }
          : d,
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-32 items-center justify-center gap-2 px-4 py-6 text-[0.8125rem] text-muted">
        <Loader2 className="size-4 animate-spin" /> {t("grioMap.privacy.loading", "Aapka data ikattha ho raha hai…")}
      </div>
    );
  }

  if (failed || !data) {
    return (
      <p className="px-4 py-5 text-[0.8125rem] text-muted sm:px-5">
        {t("grioMap.privacy.failed", "Abhi ye jaankari nahi aa payi. Thodi der baad dobara khol kar dekhiye.")}
      </p>
    );
  }

  const { behaviour } = data;

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-trust-bg text-trust">
          <ShieldCheck className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base leading-tight">
            {t("grioMap.privacy.title", "Grio ke paas aapka kya-kya hai")}
          </h3>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
            {t(
              "grioMap.privacy.subtitle",
              "Har baat ke saath likha hai ki wo aayi kahan se — aapne khud kaha, ghar walon ne kaha, ya AI ka andaza hai.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
          aria-label={t("grioMap.privacy.close", "Band karein")}
        >
          <X className="size-4" />
        </button>
      </div>

      {/* ── What Grio holds ──────────────────────────────────────────── */}
      <div className="mt-4 space-y-3">
        {data.groups.map((group) => (
          <details key={group.id} className="group rounded-lg border border-line bg-bg-subtle">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <strong className="block text-[0.8125rem] font-semibold text-ink">{group.title}</strong>
                {group.note && <small className="mt-0.5 block text-[0.6875rem] leading-snug text-muted">{group.note}</small>}
              </span>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-semibold text-muted">
                {group.facts.length}
              </span>
            </summary>
            <ul className="space-y-1.5 border-t border-line px-3 py-2.5">
              {group.facts.map((fact, i) => (
                <li key={`${fact.label}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[0.75rem] font-medium text-muted">{fact.label}</span>
                  {fact.value && <span className="text-[0.8125rem] text-ink">{fact.value}</span>}
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-medium",
                      SOURCE_TONE[fact.source] ?? "bg-bg-subtle text-muted",
                    )}
                  >
                    {fact.sourceLabel}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      {/* ── Memory, with delete ──────────────────────────────────────── */}
      <div className="mt-4 rounded-lg border border-line bg-bg-subtle p-3">
        <p className="flex items-center justify-between gap-2 text-[0.8125rem] font-semibold text-ink">
          {t("grioMap.privacy.memoryTitle", "Grio ki yaadein")}
          <span className="rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-medium text-muted">
            {data.memory.length} of {data.memoryLimit}
          </span>
        </p>
        {data.memory.length === 0 ? (
          <p className="mt-1.5 text-[0.75rem] text-muted">
            {t(
              "grioMap.privacy.memoryEmpty",
              "Abhi kuch yaad nahi rakha gaya. Baat-cheet me “ye yaad rakhna” kahiye, tabhi kuch yahan aata hai.",
            )}
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {data.memory.map((m) => (
              <li key={m.id} className="flex items-start gap-2 rounded-md bg-surface px-2.5 py-2">
                <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-ink">{m.fact}</span>
                <button
                  type="button"
                  onClick={() => deleteMemory(m.id)}
                  disabled={busy === m.id}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                  aria-label={t("grioMap.privacy.memoryDelete", "Ye yaad hata dein")}
                >
                  {busy === m.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Behaviour learning, with its two controls ─────────────────── */}
      <div className="mt-3 rounded-lg border border-line bg-bg-subtle p-3">
        <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink">
          <Wand2 className="size-4 text-info" />
          {t("grioMap.privacy.behaviourTitle", "Aapke istemaal se seekhi hui baatein")}
        </p>
        {/* The plan check comes first, and it is not cosmetic ordering: on a
            plan without Advanced Discovery nothing is being learned at all, so
            a "5 of 20 collected" line would describe a counter that is not
            feeding anything — the one number on this panel a user could not
            verify and the one claim it cannot afford to get wrong. */}
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-muted">
          {!behaviour.controllable
            ? t(
                "grioMap.privacy.behaviourNoPlan",
                "Aapke plan me ye seekh chalti hi nahi — aapke Reel ke faisle kahin jama nahi ho rahe.",
              )
            : !behaviour.enabled
              ? t(
                  "grioMap.privacy.behaviourPaused",
                  "Aapne ye seekh band ki hui hai — aapke Reel ke faisle order me nahi lagte.",
                )
              : behaviour.active
                ? t("grioMap.privacy.behaviourActive", "{count} faislon se seekh chal rahi hai.").replace(
                    "{count}",
                    String(behaviour.decisions),
                  )
                : t(
                    "grioMap.privacy.behaviourCollecting",
                    "{count} of {threshold} faisle — itne poore hone par hi seekh chalu hoti hai.",
                  )
                    .replace("{count}", String(behaviour.decisions))
                    .replace("{threshold}", String(behaviour.threshold))}
        </p>
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-muted">
          {t(
            "grioMap.privacy.behaviourSignals",
            "Sirf ye cheezein dekhi jaati hain: {signals}. Dharm, jaati, aamdani aur gotra kabhi nahi.",
          ).replace("{signals}", behaviour.signals.join(", "))}
        </p>

        {behaviour.controllable ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => patchBehaviour({ behaviorLearningEnabled: !behaviour.enabled }, "toggle")}
              disabled={busy === "toggle"}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[0.75rem] font-semibold text-ink transition-colors hover:bg-bg-subtle disabled:opacity-50"
            >
              {busy === "toggle" ? <Loader2 className="size-3.5 animate-spin" /> : <EyeOff className="size-3.5" />}
              {behaviour.enabled
                ? t("grioMap.privacy.pauseLearning", "Pause learning")
                : t("grioMap.privacy.resumeLearning", "Resume learning")}
            </button>
            <button
              type="button"
              onClick={() => patchBehaviour({ action: "resetLearnedBehavior" }, "reset")}
              disabled={busy === "reset"}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[0.75rem] font-semibold text-ink transition-colors hover:bg-bg-subtle disabled:opacity-50"
            >
              {busy === "reset" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              {t("grioMap.privacy.resetLearning", "Reset learned behaviour")}
            </button>
          </div>
        ) : (
          // Rendering the buttons disabled would suggest the plan is the only
          // thing between the user and a control that is doing something to
          // them right now. Nothing is being learned on this plan, so the
          // honest line is that there is nothing here to pause.
          <p className="mt-2.5 text-[0.75rem] text-muted">
            {t("grioMap.privacy.nothingToPause", "Band karne ko yahan abhi kuch hai hi nahi.")}
          </p>
        )}
      </div>

      {/* ── What never leaves ────────────────────────────────────────── */}
      <div className="mt-3 rounded-lg border border-trust/30 bg-trust-bg p-3">
        <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-trust">
          <EyeOff className="size-4" /> {t("grioMap.privacy.hiddenTitle", "Ye kabhi bahar nahi jaata")}
        </p>
        <ul className="mt-1.5 space-y-1">
          {data.hidden.map((line) => (
            <li key={line} className="text-[0.75rem] leading-relaxed text-trust">
              • {line}
            </li>
          ))}
        </ul>
      </div>

      {/* Correcting an answer is the one control this panel does not own — the
          catalog decides what each answer may be, so the edit belongs on the
          screen that knows the options. */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/user/profile/intelligence"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-bg-subtle"
        >
          <Pencil className="size-3.5" /> {t("grioMap.privacy.correctAnswer", "Correct an answer")}
        </Link>
        <Link
          href="/user/app-setup"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-bg-subtle"
        >
          {t("grioMap.privacy.changeVisibility", "Change visibility")} <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
