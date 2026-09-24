"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Copy, RotateCcw, Save, Star, Trash2, Wand2, SlidersHorizontal } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  GLASS_CONTROLS,
  GLASS_DEVICE_LABEL,
  GLASS_GROUPS,
  READABLE,
  SHIPPED_GLASS,
  TINT_SWATCHES,
  bandOf,
  formatKnob,
  matchPreset,
  otherDevice,
  type GlassControl,
  type GlassDevice,
  type GlassMode,
  type GlassPreset,
  type GlassValues,
  type RoomGlass,
} from "@/lib/theme/glass";
import { roomGlass, roomReadability, type RoomConfig } from "@/lib/theme/rooms";

function Readability({ label, ratio }: { label: string; ratio: number }) {
  const pass = ratio >= READABLE;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-medium",
        pass ? "bg-trust-bg text-trust" : "bg-warn-bg text-warn",
      )}
    >
      {pass ? <CircleCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}
      {label} {ratio.toFixed(1)}:1
    </span>
  );
}

/** One knob: its name, the exact value, the named band it is in, and the range. */
function GlassSlider({
  control,
  value,
  onChange,
}: {
  control: GlassControl;
  value: number;
  onChange: (value: number) => void;
}) {
  const band = bandOf(control, value);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between gap-3 text-[0.8125rem]">
        <span className="font-semibold text-ink">{control.label}</span>
        <span className="flex shrink-0 items-center gap-2">
          {band && (
            <span className="rounded-full border border-line px-2 py-0.5 text-[0.7rem] font-medium text-muted">{band}</span>
          )}
          <span className="min-w-[3.25rem] text-right font-mono text-[0.8125rem] font-semibold text-ink">
            {formatKnob(control, value)}
          </span>
        </span>
      </span>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${formatKnob(control, value)}${band ? `, ${band}` : ""}`}
        className="w-full"
        // `accent-color` inline: a Tailwind arbitrary `accent-[var(--x)]`
        // can silently generate no rule in this codebase.
        style={{ accentColor: "var(--bt-accent)" }}
      />
      <span className="text-[0.72rem] leading-snug text-subtle">{control.hint}</span>
    </label>
  );
}

function TintPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const known = TINT_SWATCHES.some((swatch) => swatch.hex === value);
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center justify-between text-[0.8125rem]">
        <span className="font-semibold text-ink">Tint Colour</span>
        <span className="font-mono text-[0.8125rem] font-semibold uppercase text-ink">{value}</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {TINT_SWATCHES.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            aria-pressed={swatch.hex === value}
            title={swatch.name}
            onClick={() => onChange(swatch.hex)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] font-medium text-ink transition-colors",
              swatch.hex === value ? "border-gold-500 ring-2 ring-gold-500/40" : "border-line hover:border-line-strong",
            )}
          >
            <span className="size-3.5 rounded-full border border-black/20" style={{ background: swatch.hex }} />
            {swatch.name}
          </button>
        ))}
        <label
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] font-medium text-ink",
            !known ? "border-gold-500 ring-2 ring-gold-500/40" : "border-line hover:border-line-strong",
          )}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="size-4 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
          Custom
        </label>
      </div>
      <span className="text-[0.72rem] leading-snug text-subtle">
        Glass ke upar kaunsa rang — safed, halka, ya gehra. Kitna, ye neeche Tint Overlay tay karta hai.
      </span>
    </div>
  );
}

/**
 * The glass over one room's photo, one device at a time — /admin/theme's
 * manual glass control.
 *
 * AUTO is the glass as it shipped: the system measures the photo and works out
 * how dark the glass takes it, and the sliders show exactly what it chose.
 * MANUAL hands every number to the admin — nothing about the photo moves them.
 * Choosing Manual, touching a slider or applying a preset all take over the
 * same way: from the numbers already on screen (or the admin's earlier manual
 * ones, if the room has them), so taking control never jumps the look.
 * Everything here edits the draft only; members see it when the rooms are
 * saved.
 *
 * Presets are a library beside that: applying one fills this device's
 * sliders; saving one (new, or over an existing one) writes the library
 * straight away, without touching any room.
 */
export default function GlassControlPanel({
  room,
  device,
  presets,
  onGlassChange,
  onPresetsChange,
}: {
  room: RoomConfig;
  device: GlassDevice;
  presets: GlassPreset[];
  onGlassChange: (glass: RoomGlass) => void;
  onPresetsChange: (presets: GlassPreset[]) => void;
}) {
  const { toast } = useToast();
  const [lastPreset, setLastPreset] = useState<Record<string, string>>({});
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState(false);

  const manual = room.glass.mode === "manual";
  const values = roomGlass(room, device) ?? SHIPPED_GLASS;
  const readability = roomReadability(room, device);
  const other = otherDevice(device);
  const defaultPreset = presets.find((preset) => preset.isDefault) ?? presets[0];
  const matched = matchPreset(values, presets);
  const slot = `${room.id}:${device}`;
  const base = matched ?? presets.find((preset) => preset.id === lastPreset[slot]) ?? null;

  /** Manual numbers for both devices: the ones already set, else what is on screen right now. */
  function takeOver(): RoomGlass {
    return {
      mode: "manual",
      mobile: room.glass.mobile ?? roomGlass(room, "mobile") ?? SHIPPED_GLASS,
      desktop: room.glass.desktop ?? roomGlass(room, "desktop") ?? SHIPPED_GLASS,
    };
  }

  function setMode(mode: GlassMode) {
    if (mode === room.glass.mode) return;
    onGlassChange(mode === "manual" ? takeOver() : { ...room.glass, mode: "auto" });
  }

  function setValues(target: GlassDevice | "both", next: GlassValues) {
    const glass = manual ? room.glass : takeOver();
    onGlassChange({
      ...glass,
      mode: "manual",
      mobile: target === "desktop" ? glass.mobile : next,
      desktop: target === "mobile" ? glass.desktop : next,
    });
  }

  function setKnob(change: Partial<GlassValues>) {
    setValues(device, { ...values, ...change });
  }

  function applyPreset(preset: GlassPreset) {
    setLastPreset((all) => ({ ...all, [slot]: preset.id }));
    setValues(device, preset.values);
  }

  function reset(target: GlassDevice | "both") {
    if (!defaultPreset) return;
    setValues(target, defaultPreset.values);
    if (target === "both") setLastPreset((all) => ({ ...all, [`${room.id}:mobile`]: defaultPreset.id, [`${room.id}:desktop`]: defaultPreset.id }));
    else setLastPreset((all) => ({ ...all, [`${room.id}:${target}`]: defaultPreset.id }));
  }

  async function presetRequest(method: "POST" | "PATCH" | "DELETE", body?: unknown, query = "") {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/theme/glass-presets${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast({ title: "Preset save nahi hua", description: json?.message, tone: "error" });
        return null;
      }
      onPresetsChange(json.presets as GlassPreset[]);
      return json.presets as GlassPreset[];
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveAsNew() {
    const name = presetName.trim();
    if (!name) return;
    const next = await presetRequest("POST", { name, values });
    if (!next) return;
    const created = matchPreset(values, next.filter((preset) => !presets.some((old) => old.id === preset.id)));
    if (created) setLastPreset((all) => ({ ...all, [slot]: created.id }));
    setNaming(false);
    setPresetName("");
    toast({ title: `"${name}" preset save ho gaya`, tone: "success" });
  }

  async function updateBase() {
    if (!base) return;
    if (await presetRequest("POST", { id: base.id, name: base.name, values })) {
      toast({ title: `"${base.name}" update ho gaya`, description: "Ab ye preset in values se khulega.", tone: "success" });
    }
  }

  async function makeDefault() {
    if (!base) return;
    if (await presetRequest("PATCH", { defaultId: base.id })) {
      toast({ title: `"${base.name}" ab default preset hai`, description: "Reset isi par le jayega.", tone: "success" });
    }
  }

  async function removeBase() {
    if (!base) return;
    if (await presetRequest("DELETE", undefined, `?id=${encodeURIComponent(base.id)}`)) {
      toast({
        title: base.builtIn ? `"${base.name}" apni asli values par wapas` : `"${base.name}" delete ho gaya`,
        tone: "success",
      });
    }
  }

  if (!readability) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[0.8125rem] leading-relaxed text-muted">
        Glass controls photo ke saath kaam karte hain. Pehle upar Mobile ya Desktop ki photo lagaiye — bina photo ke is
        theme ka apna naapa hua glass hi rehta hai.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---- whose numbers ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-base font-bold text-ink">Glass</h4>
          <div className="inline-flex rounded-full border border-line-strong bg-surface p-1" role="group" aria-label="Glass mode">
            {(["manual", "auto"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={room.glass.mode === mode}
                onClick={() => setMode(mode)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors",
                  room.glass.mode === mode ? "bg-accent text-accent-fg shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {mode === "manual" ? <SlidersHorizontal className="size-4" /> : <Wand2 className="size-4" />}
                {mode === "manual" ? "Manual" : "Auto"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[0.75rem] leading-relaxed text-muted">
          {manual
            ? "Manual: har value aap tay karte hain — photo ki roshni se kuch apne aap nahi badlega. Mobile aur Desktop alag-alag set hote hain."
            : "Auto: system photo ki roshni naap kar glass ko khud gehra/saaf karta hai (jaisa abhi tak tha). Neeche wahi values dikh rahi hain jo Auto ne chuni hain — koi slider hilayein ya preset chunein to Manual shuru ho jayega, abhi ki values se."}
        </p>
      </div>

      {/* ---- presets ---- */}
      <div className="flex flex-col gap-2">
        <span className="text-[0.8125rem] font-semibold text-ink">Presets</span>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const active = manual && matched?.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => applyPreset(preset)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors",
                  active ? "border-gold-500 ring-2 ring-gold-500/40" : "border-line hover:border-line-strong",
                )}
              >
                {preset.isDefault && <Star className="size-3.5 text-gold-500" aria-label="Default" />}
                {preset.name}
              </button>
            );
          })}
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium",
              manual && !matched ? "border-gold-500 text-ink ring-2 ring-gold-500/40" : "border-dashed border-line text-subtle",
            )}
          >
            Custom{manual && !matched && base ? ` (from ${base.name})` : ""}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {naming ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveAsNew();
              }}
            >
              <input
                autoFocus
                value={presetName}
                maxLength={32}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset ka naam"
                className="h-10 w-44 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink"
              />
              <Button size="sm" variant="secondary" type="submit" loading={busy} disabled={!presetName.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setNaming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <Button size="sm" variant="secondary" icon={<Save className="size-4" />} onClick={() => setNaming(true)}>
              Save as New Preset
            </Button>
          )}
          {base && !matched && (
            <Button size="sm" variant="secondary" loading={busy} onClick={updateBase}>
              Update &ldquo;{base.name}&rdquo;
            </Button>
          )}
          {base && !base.isDefault && (
            <Button size="sm" variant="ghost" icon={<Star className="size-4" />} disabled={busy} onClick={makeDefault}>
              Make &ldquo;{base.name}&rdquo; Default
            </Button>
          )}
          {base && (!base.builtIn || base.edited) && (
            <Button size="sm" variant="ghost" icon={base.builtIn ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />} disabled={busy} onClick={removeBase}>
              {base.builtIn ? `Restore “${base.name}”` : `Delete “${base.name}”`}
            </Button>
          )}
        </div>
        <p className="text-[0.72rem] leading-snug text-subtle">
          Preset lagane se sirf is device ke sliders bharte hain — live tab hoga jab Save Themes dabayenge. Preset
          save/update karna library badalta hai, kisi theme ko nahi.
        </p>
      </div>

      {/* ---- the knobs ---- */}
      {GLASS_GROUPS.map((group) => (
        <fieldset key={group.id} className="flex flex-col gap-4 rounded-xl border border-line p-4">
          <legend className="px-1.5 text-[0.8125rem] font-bold text-ink">
            {group.label} <span className="font-normal text-subtle">· {group.note}</span>
          </legend>
          {group.id === "body" && (
            <TintPicker value={values.tint} onChange={(tint) => setKnob({ tint })} />
          )}
          {GLASS_CONTROLS.filter((control) => control.group === group.id).map((control) => (
            <GlassSlider
              key={control.key}
              control={control}
              value={values[control.key]}
              onChange={(value) => setKnob({ [control.key]: value })}
            />
          ))}
        </fieldset>
      ))}

      {/* ---- what it does to reading ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Readability label="Body text" ratio={readability.average} />
          <Readability label="Heading, roshan hisse par" ratio={readability.bright} />
        </div>
        <p className="text-[0.72rem] leading-snug text-muted">
          {manual
            ? "Ye sirf salah hai — Manual me final faisla aapka. 4.5:1 se upar = aaram se padha jayega, peela = text mushkil se padha jayega."
            : "Auto hamesha 4.5:1 ke upar rehne ki koshish karta hai. Peela dikhe to photo ka Dim badhaiye."}
        </p>
      </div>

      {/* ---- back to the default ---- */}
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => reset("mobile")}>
            Reset Mobile
          </Button>
          <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => reset("desktop")}>
            Reset Desktop
          </Button>
          <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => reset("both")}>
            Reset All
          </Button>
          <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={() => setValues(other, values)}>
            Copy to {GLASS_DEVICE_LABEL[other]}
          </Button>
        </div>
        <p className="text-[0.72rem] leading-snug text-subtle">
          Reset glass ko default preset{defaultPreset ? ` (“${defaultPreset.name}”)` : ""} par le jata hai, Manual me.
          Auto par wapas jaane ke liye upar Auto chunein.
        </p>
      </div>
    </div>
  );
}
