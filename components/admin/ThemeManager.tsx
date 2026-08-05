"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Palette } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import { cn } from "@/lib/utils";
import {
  CONTRAST_VERDICT_LABEL,
  contrastRatio,
  contrastVerdict,
  isValidHex,
  pickForeground,
} from "@/lib/theme/contrast";

type PackId = "KUNDAN" | "RAAT" | "KAAGAZ" | "CUSTOM";
type CustomColors = { primary: string; primaryText: string; accent: string; accentText: string; signal: string };

const KUNDAN_DEFAULTS: CustomColors = {
  primary: "#c9a96e",
  primaryText: "#806634",
  accent: "#4a1119",
  accentText: "#4a1119",
  signal: "#1f7a5a",
};

/** Kundan's own light/dark grounds — a CUSTOM theme layers onto both (see
 *  siteThemeService's buildCustomVars), so the picker checks a colour
 *  against both rather than pretending only one mode exists. */
const LIGHT_GROUND = "#fbf9fa";
const DARK_GROUND = "#100c0a";

const PRESETS: {
  id: Exclude<PackId, "CUSTOM">;
  label: string;
  tagline: string;
  ground: string;
  ink: string;
  swatches: string[];
}[] = [
  {
    id: "KUNDAN",
    label: "Kundan",
    tagline: "Mehroon, gold, mehendi-green — shaadi ke card jaisa. App ka original look.",
    ground: "#fbf7f0",
    ink: "#1a1512",
    swatches: ["#4a1119", "#c9a96e", "#1f7a5a"],
  },
  {
    id: "RAAT",
    label: "Raat",
    tagline: "Dark-first — charcoal par champagne aur garnet. Toggle chahe jo ho, hamesha dark dikhta hai.",
    ground: "#0c0b0e",
    ink: "#f4efe8",
    swatches: ["#e4c98d", "#9b1b3f", "#2fa98c"],
  },
  {
    id: "KAAGAZ",
    label: "Kaagaz",
    tagline: "Sirf mehroon aur ek patli gold line. Sabse shaant, sabse kam rang.",
    ground: "#f7f6f3",
    ink: "#14110f",
    swatches: ["#7a1f2b", "#c9a96e"],
  },
];

function PresetSwatch({ p }: { p: (typeof PRESETS)[number] }) {
  return (
    <div
      className="flex h-16 items-center gap-2 rounded-md px-3"
      style={{ background: p.ground, color: p.ink, border: "1px solid rgb(0 0 0 / 0.08)" }}
    >
      {p.swatches.map((c) => (
        <span key={c} className="size-6 shrink-0 rounded-full shadow-sm" style={{ background: c }} />
      ))}
    </div>
  );
}

function ContrastBadge({ ratio, min = 4.5 }: { ratio: number; min?: number }) {
  const verdict = contrastVerdict(ratio);
  const pass = ratio >= min;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
        pass ? "bg-trust-bg text-trust" : "bg-warn-bg text-warn",
      )}
    >
      {!pass && <CircleAlert className="size-3" />}
      {ratio.toFixed(2)}:1 · {CONTRAST_VERDICT_LABEL[verdict]}
    </span>
  );
}

function HexField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const valid = isValidHex(draft);

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={valid ? draft : value}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        className="size-10 shrink-0 cursor-pointer rounded-md border border-line-strong bg-transparent p-0.5"
        aria-label={`${label} colour picker`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[0.8125rem] font-semibold text-ink">{label}</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (isValidHex(e.target.value)) onChange(e.target.value);
            }}
            spellCheck={false}
            className={cn(
              "w-24 rounded-md border bg-surface px-2 py-0.5 font-mono text-[0.75rem]",
              valid ? "border-line-strong text-ink" : "border-danger text-danger",
            )}
          />
        </div>
        <p className="mt-0.5 text-[0.75rem] text-muted">{hint}</p>
      </div>
    </div>
  );
}

export default function ThemeManager({
  currentPack,
  currentCustom,
}: {
  currentPack: PackId;
  currentCustom: CustomColors | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<"preset" | "custom">(currentPack === "CUSTOM" ? "custom" : "preset");
  const [pendingPreset, setPendingPreset] = useState<Exclude<PackId, "CUSTOM"> | null>(null);
  const [draft, setDraft] = useState<CustomColors>(currentCustom ?? KUNDAN_DEFAULTS);
  const [confirmCustom, setConfirmCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  const primaryFg = useMemo(() => pickForeground(draft.primary), [draft.primary]);
  const accentFg = useMemo(() => pickForeground(draft.accent), [draft.accent]);

  async function savePreset() {
    if (!pendingPreset) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preset", pack: pendingPreset }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: `${pendingPreset} ab live hai`, tone: "success" });
      setPendingPreset(null);
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveCustom() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "custom", colors: draft }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Custom theme live ho gaya", tone: "success" });
      setConfirmCustom(false);
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="inline-flex w-fit rounded-full border border-line-strong bg-surface p-1">
        {(["preset", "custom"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[0.8125rem] font-semibold transition-colors",
              tab === t ? "bg-primary text-primary-fg" : "text-muted hover:text-ink",
            )}
          >
            {t === "preset" ? "Taiyaar Themes" : "Khud Ka Rang"}
          </button>
        ))}
      </div>

      {tab === "preset" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {PRESETS.map((p) => {
            const isLive = currentPack === p.id;
            return (
              <Card key={p.id} variant={isLive ? "trust" : "default"} padding="sm">
                <div className="flex flex-col gap-2.5">
                  <PresetSwatch p={p} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-ink">{p.label}</h3>
                      {isLive && (
                        <span className="rounded-full bg-trust px-2 py-0.5 text-[0.625rem] font-semibold text-white">
                          Live
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[0.75rem] leading-snug text-muted">{p.tagline}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={isLive ? "secondary" : "primary"}
                    fullWidth
                    disabled={isLive || busy}
                    onClick={() => setPendingPreset(p.id)}
                  >
                    {isLive ? "Ye abhi live hai" : "Isse Chunein"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "custom" && (
        <Card variant="soft" padding="lg">
          <div className="flex flex-col gap-6">
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              Sirf ye paanch identity colours edit hote hain — neutrals, warn/danger/info tab wahi rehte
              hain jo D-21 me pehle se audit ho chuke hain. Button/chip par jo text colour chahiye (fg) wo
              khud-ba-khud us fill se sabse achha contrast dekh kar chunta hai, taaki koi combination kabhi
              illegible na bane.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <HexField
                  label="Primary Fill"
                  hint="Gold jaisa — buttons, chips ka background."
                  value={draft.primary}
                  onChange={(hex) => setDraft((d) => ({ ...d, primary: hex }))}
                />
                <div className="ml-[3.25rem] mt-1.5">
                  <ContrastBadge ratio={contrastRatio(draft.primary, primaryFg)} />
                  <span className="ml-2 text-[0.6875rem] text-subtle">
                    Text auto: {primaryFg === "#ffffff" ? "safed" : "kaala"}
                  </span>
                </div>
              </div>

              <div>
                <HexField
                  label="Primary Text"
                  hint="Headings, labels ka gold — text ke roop me use hota hai."
                  value={draft.primaryText}
                  onChange={(hex) => setDraft((d) => ({ ...d, primaryText: hex }))}
                />
                <div className="ml-[3.25rem] mt-1.5 flex flex-wrap gap-2">
                  <ContrastBadge ratio={contrastRatio(draft.primaryText, LIGHT_GROUND)} />
                  <span className="text-[0.6875rem] text-subtle">light mode</span>
                  <ContrastBadge ratio={contrastRatio(draft.primaryText, DARK_GROUND)} />
                  <span className="text-[0.6875rem] text-subtle">dark mode</span>
                </div>
              </div>

              <div>
                <HexField
                  label="Accent Fill"
                  hint='Faisla wale button ka rang — jaise "Interest Bhejein".'
                  value={draft.accent}
                  onChange={(hex) => setDraft((d) => ({ ...d, accent: hex }))}
                />
                <div className="ml-[3.25rem] mt-1.5">
                  <ContrastBadge ratio={contrastRatio(draft.accent, accentFg)} />
                  <span className="ml-2 text-[0.6875rem] text-subtle">
                    Text auto: {accentFg === "#ffffff" ? "safed" : "kaala"}
                  </span>
                </div>
              </div>

              <div>
                <HexField
                  label="Accent Text"
                  hint="Wahi rang jab text ke roop me chahiye ho (link, heading)."
                  value={draft.accentText}
                  onChange={(hex) => setDraft((d) => ({ ...d, accentText: hex }))}
                />
                <div className="ml-[3.25rem] mt-1.5 flex flex-wrap gap-2">
                  <ContrastBadge ratio={contrastRatio(draft.accentText, LIGHT_GROUND)} />
                  <span className="text-[0.6875rem] text-subtle">light mode</span>
                  <ContrastBadge ratio={contrastRatio(draft.accentText, DARK_GROUND)} />
                  <span className="text-[0.6875rem] text-subtle">dark mode</span>
                </div>
              </div>

              <div>
                <HexField
                  label="Signal"
                  hint="Verified badge, trust score ka rang."
                  value={draft.signal}
                  onChange={(hex) => setDraft((d) => ({ ...d, signal: hex }))}
                />
                <div className="ml-[3.25rem] mt-1.5 flex flex-wrap gap-2">
                  <ContrastBadge ratio={contrastRatio(draft.signal, LIGHT_GROUND)} />
                  <span className="text-[0.6875rem] text-subtle">light mode</span>
                  <ContrastBadge ratio={contrastRatio(draft.signal, DARK_GROUND)} />
                  <span className="text-[0.6875rem] text-subtle">dark mode</span>
                </div>
              </div>
            </div>

            {/* Live preview — draft colours, not yet saved */}
            <div className="rounded-lg border border-line bg-surface p-4">
              <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-wide text-subtle">
                Live Preview
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[0.875rem] font-semibold shadow-md"
                  style={{ background: draft.accent, color: accentFg }}
                >
                  Interest Bhejein
                </button>
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.75rem] font-medium"
                  style={{ borderColor: `${draft.primary}80`, color: draft.primaryText, background: `${draft.primary}1a` }}
                >
                  ✦ Premium
                </span>
                <span className="inline-flex items-center gap-1 text-[0.8125rem] font-medium" style={{ color: draft.signal }}>
                  ✓ Photo Verified
                </span>
              </div>
            </div>

            <Button
              variant="accent"
              icon={<Palette className="size-4" />}
              disabled={busy}
              onClick={() => setConfirmCustom(true)}
              className="self-start"
            >
              Custom Theme Save Karein
            </Button>
          </div>
        </Card>
      )}

      <AdminActionConfirmModal
        isOpen={pendingPreset !== null}
        onClose={() => setPendingPreset(null)}
        onConfirm={savePreset}
        title={pendingPreset ? `${pendingPreset} theme live karein?` : ""}
        description="Poore site ka colour turant badal jayega — har user ke liye, agli page load par."
        confirmLabel="Haan, live karein"
      />

      <AdminActionConfirmModal
        isOpen={confirmCustom}
        onClose={() => setConfirmCustom(false)}
        onConfirm={saveCustom}
        title="Custom theme live karein?"
        description="Ye paanch colours poore site par turant apply ho jayenge — har user ke liye, agli page load par."
        variant={
          [draft.primaryText, draft.accentText, draft.signal].some(
            (c) => contrastRatio(c, LIGHT_GROUND) < 4.5 || contrastRatio(c, DARK_GROUND) < 4.5,
          )
            ? "warning"
            : "success"
        }
        confirmLabel="Haan, live karein"
      />
    </div>
  );
}
