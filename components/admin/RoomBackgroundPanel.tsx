"use client";

import { useRef, useState } from "react";
import { CircleAlert, ImagePlus, Images, RotateCcw, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { DIM_MAX, GLASS_DEVICE_LABEL, otherDevice, type GlassDevice } from "@/lib/theme/glass";
import {
  DESKTOP_MIN_WIDTH,
  ROOM_LABEL,
  deviceView,
  isSoftPhoto,
  type RoomBackground,
  type RoomConfig,
  type RoomPhotoView,
} from "@/lib/theme/rooms";

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  display: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[0.8125rem]">
        <span className="font-semibold text-ink">{label}</span>
        <span className="font-mono font-semibold text-ink">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: "var(--bt-accent)" }}
      />
    </label>
  );
}

const SHAPE: Record<GlassDevice, { need: string; best: string; screens: string }> = {
  mobile: {
    need: "khadi (portrait)",
    best: "1080×2400",
    screens: `${DESKTOP_MIN_WIDTH}px se chhoti screen — phone`,
  },
  desktop: {
    need: "leti hui (landscape)",
    best: "2560×1440",
    screens: `${DESKTOP_MIN_WIDTH}px aur badi screen — laptop, desktop, tablet ka desktop layout`,
  },
};

/**
 * One device's background for one room: its photo (uploaded, or chosen from
 * the photos already uploaded), the scrim over it and the point a screen
 * crops around. A device without a photo of its own shows the other one's,
 * with that photo's own dim and crop — so this panel says so, and edits
 * nothing it does not own.
 */
export default function RoomBackgroundPanel({
  room,
  saved,
  device,
  uploading,
  onUpload,
  onPick,
  onChange,
}: {
  room: RoomConfig;
  saved: RoomConfig;
  device: GlassDevice;
  uploading: boolean;
  onUpload: (file: File) => void;
  onPick: (photo: RoomPhotoView) => void;
  onChange: (change: Partial<RoomBackground>) => void;
}) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<RoomPhotoView[] | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  const own = room[device];
  const view = deviceView(room, device);
  const other = otherDevice(device);
  const shape = SHAPE[device];

  async function openLibrary() {
    setLoadingLibrary(true);
    try {
      const res = await fetch(`/api/admin/theme/rooms/photos?device=${device}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast({ title: "Library nahi khuli", description: json?.message, tone: "error" });
        return;
      }
      setLibrary(json.photos as RoomPhotoView[]);
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setLoadingLibrary(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="text-base font-bold text-ink">{GLASS_DEVICE_LABEL[device]} Background</h4>
        <p className="text-[0.75rem] text-muted">{shape.screens}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="accent"
          icon={<ImagePlus className="size-4" />}
          loading={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {own.photo ? "Replace Photo" : "Upload Photo"}
        </Button>
        <Button size="sm" variant="secondary" icon={<Images className="size-4" />} loading={loadingLibrary} onClick={openLibrary}>
          Choose from Library
        </Button>
        {own.photo && (
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => onChange({ photo: null })}>
            Remove Photo
          </Button>
        )}
        {saved[device].photo && !own.photo && (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => onChange(saved[device])}>
            Undo
          </Button>
        )}
      </div>

      {library && (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.8125rem] font-semibold text-ink">
              Pehle upload hui {shape.need} photos
            </span>
            <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={() => setLibrary(null)}>
              <X className="size-4" />
            </Button>
          </div>
          {library.length === 0 ? (
            <p className="text-[0.75rem] text-muted">Abhi koi {shape.need} photo upload nahi hui.</p>
          ) : (
            <div className={cn("grid gap-2", device === "mobile" ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-3")}>
              {library.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  aria-pressed={own.photo?.id === photo.id}
                  onClick={() => {
                    onPick(photo);
                    setLibrary(null);
                  }}
                  className={cn(
                    "relative overflow-hidden rounded-lg border",
                    device === "mobile" ? "aspect-[9/16]" : "aspect-video",
                    own.photo?.id === photo.id ? "border-gold-500 ring-2 ring-gold-500/40" : "border-line hover:border-line-strong",
                  )}
                  title={`${photo.width}×${photo.height}px`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a stored, re-encoded room photo */}
                  <img src={photo.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!view ? (
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Abhi {ROOM_LABEL[room.id]} ka apna drawing wala background hai. {GLASS_DEVICE_LABEL[device]} ke liye {shape.need}{" "}
          photo lagaiye — {shape.best} sabse achhi, JPG/PNG/WebP, 15MB tak. Photo lagte hi is theme ke saare cards — /bolo
          samet — glass ban jayenge, aur neeche Glass controls khul jayenge.
        </p>
      ) : !view.own ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[0.8125rem] leading-relaxed text-muted">
          {GLASS_DEVICE_LABEL[device]} ki apni photo nahi hai, isliye yahan {GLASS_DEVICE_LABEL[other]} wali photo dikh rahi hai
          {device === "desktop" ? " — poori, dono taraf uski dhundhli copy ke saath" : " — beech se kaati hui"}, usi ke Dim (
          {Math.round(view.dim * 100)}%) aur focus ke saath. Uska Dim {GLASS_DEVICE_LABEL[other]} tab se badliye, ya{" "}
          {GLASS_DEVICE_LABEL[device]} ke liye alag {shape.need} photo lagaiye. Glass ki values phir bhi yahan alag set hoti hain.
        </p>
      ) : (
        <>
          <p className="text-[0.75rem] text-subtle">
            {view.photo.width}×{view.photo.height}px · recommended dim {Math.round(view.photo.recommendedDim * 100)}%
          </p>
          {isSoftPhoto(view.photo, device) && (
            <p className="-mt-2 inline-flex items-start gap-1.5 text-[0.75rem] leading-relaxed text-warn">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              Ye photo is screen se chhoti hai, isliye thodi soft dikh sakti hai. Tez photo ke liye {shape.best} lagaiye.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Slider
              label="Photo Dim"
              value={Math.round(own.dim * 100)}
              min={0}
              max={Math.round(DIM_MAX * 100)}
              onChange={(v) => onChange({ dim: v / 100 })}
              display={`${Math.round(own.dim * 100)}%`}
            />
            {Math.round(own.dim * 100) !== Math.round(view.photo.recommendedDim * 100) && (
              <Button size="sm" variant="link" className="self-start" onClick={() => onChange({ dim: view.photo.recommendedDim })}>
                Use Recommended ({Math.round(view.photo.recommendedDim * 100)}%)
              </Button>
            )}
            <p className="text-[0.75rem] leading-relaxed text-muted">
              Poori photo ko kitna gehra karein — glass ke andar aur bahar dono jagah. Glass ka apna andhera/roshni neeche
              Glass me alag se set hota hai.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Slider
              label="Focus — left / right"
              value={own.focusX}
              min={0}
              max={100}
              onChange={(v) => onChange({ focusX: v })}
              display={`${own.focusX}%`}
            />
            <Slider
              label="Focus — up / down"
              value={own.focusY}
              min={0}
              max={100}
              onChange={(v) => onChange({ focusY: v })}
              display={`${own.focusY}%`}
            />
          </div>
          <p className="-mt-2 text-[0.75rem] text-muted">Jab screen photo se patli ya chhoti ho, to photo ka kaunsa hissa dikhe.</p>
        </>
      )}
    </div>
  );
}
