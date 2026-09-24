"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, ImagePlus, RotateCcw, Star, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import RoomPreview from "@/components/admin/RoomPreview";
import { cn } from "@/lib/utils";
import {
  DIM_MAX,
  READABLE,
  ROOM_IDS,
  ROOM_LABEL,
  canHavePhoto,
  isSoftPhoto,
  photoContrast,
  type RoomConfig,
  type RoomId,
  type RoomPhotoView,
  type ThemeRooms,
} from "@/lib/theme/rooms";

type Draft = { rooms: Record<RoomId, RoomConfig>; defaultRoom: RoomId };

function toDraft(initial: ThemeRooms): Draft {
  return {
    rooms: Object.fromEntries(initial.rooms.map((room) => [room.id, room])) as Record<RoomId, RoomConfig>,
    defaultRoom: initial.defaultRoom,
  };
}

/** What `PUT /api/admin/theme/rooms` takes — and what "has anything changed" compares. */
function toPayload(draft: Draft) {
  return {
    rooms: ROOM_IDS.map((id) => {
      const room = draft.rooms[id];
      return {
        id,
        enabled: room.enabled,
        photoId: room.photo?.id ?? null,
        dim: room.dim,
        focusX: room.focusX,
        focusY: room.focusY,
      };
    }),
    defaultRoom: draft.defaultRoom,
  };
}

/** One line about each room, for the tile. */
const ROOM_NOTE: Record<RoomId, string> = {
  terrace: "Champagne satin aur wine",
  ivory: "Graphite aur plum",
  gold: "Lamp ki sunehri raat",
  paper: "Cream paper — hamesha bina photo",
};

/** A stand-in for the drawn room on a tile. The preview below shows the real one. */
const ROOM_SWATCH: Record<RoomId, CSSProperties> = {
  terrace: { background: "linear-gradient(160deg, #f0d2ab 0%, #a87a5f 30%, #5c3a22 58%, #5c1420 82%, #2a0710 100%)" },
  ivory: { background: "linear-gradient(162deg, #9a5634 0%, #6c3427 38%, #512a23 64%, #8a4a2e 100%)" },
  gold: { background: "radial-gradient(70% 40% at 78% 6%, #d9a45a 0%, transparent 70%), linear-gradient(170deg, #3a2410 0%, #1b0f07 100%)" },
  paper: { background: "linear-gradient(180deg, #fffdf9 0%, #f6efe4 100%)" },
};

function Contrast({ label, ratio }: { label: string; ratio: number }) {
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
        <span className="font-mono text-muted">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        // `accent-color` inline: a Tailwind arbitrary `accent-[var(--x)]`
        // can silently generate no rule in this codebase.
        style={{ accentColor: "var(--bt-accent)" }}
      />
    </label>
  );
}

/**
 * The four rooms of the theme button, for an admin: which are on, which one a
 * first visit gets, and — for Satin, Day and Night — a photo that replaces the
 * drawn background. Classic is never given one.
 *
 * Nothing here is live until "Save Themes". An upload only processes and
 * stores the photo and hands back what it measured; the phone preview shows
 * the unsaved state, with the contrast the glass's type will have over it.
 */
export default function ThemeRoomManager({ initial }: { initial: ThemeRooms }) {
  const router = useRouter();
  const { toast } = useToast();
  const saved = useMemo(() => toDraft(initial), [initial]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [selected, setSelected] = useState<RoomId>(initial.defaultRoom);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(toPayload(draft)) !== JSON.stringify(toPayload(saved));
  const room = draft.rooms[selected];
  const isDefault = draft.defaultRoom === selected;
  const contrast = room.photo ? photoContrast(room.photo, room.dim) : null;

  function patch(id: RoomId, change: Partial<RoomConfig>) {
    setDraft((d) => ({ ...d, rooms: { ...d.rooms, [id]: { ...d.rooms[id], ...change } } }));
  }

  function makeDefault(id: RoomId) {
    // A default that is switched off would send every first visit to a room
    // the button cannot reach, so making one default also switches it on.
    setDraft((d) => ({ defaultRoom: id, rooms: { ...d.rooms, [id]: { ...d.rooms[id], enabled: true } } }));
  }

  function attachPhoto(id: RoomId, photo: RoomPhotoView) {
    patch(id, { photo, dim: photo.recommendedDim, focusX: 50, focusY: 50 });
  }

  async function upload(file: File) {
    const target = selected;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/theme/rooms/photo", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast({ title: "Photo upload nahi hui", description: json?.message, tone: "error" });
        return;
      }
      attachPhoto(target, json.photo as RoomPhotoView);
      toast({
        title: `${ROOM_LABEL[target]} ki photo taiyaar`,
        description: "Preview dekh lijiye — Save Themes dabane par hi live hogi.",
        tone: "success",
      });
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/theme/rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(draft)),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast({ title: "Save fail hua", description: json?.message, tone: "error" });
        return;
      }
      toast({ title: "Themes live ho gayi", tone: "success" });
      setConfirm(false);
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const changes = ROOM_IDS.filter((id) => {
    const [a, b] = [toPayload(draft).rooms, toPayload(saved).rooms].map((rooms) => rooms.find((r) => r.id === id));
    return JSON.stringify(a) !== JSON.stringify(b);
  }).map((id) => ROOM_LABEL[id]);
  if (draft.defaultRoom !== saved.defaultRoom) changes.push(`Default → ${ROOM_LABEL[draft.defaultRoom]}`);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ROOM_IDS.map((id) => {
          const r = draft.rooms[id];
          const active = id === selected;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(id)}
              className={cn(
                "flex flex-col gap-2 rounded-xl border bg-surface p-2.5 text-left transition-colors",
                active ? "border-gold-500 ring-2 ring-gold-500/40" : "border-line hover:border-line-strong",
                !r.enabled && "opacity-60",
              )}
            >
              <span className="relative block aspect-[9/14] overflow-hidden rounded-lg" style={r.photo ? undefined : ROOM_SWATCH[id]}>
                {r.photo && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of the stored, re-encoded room photo */}
                    <img
                      src={r.photo.imageUrl}
                      alt=""
                      className="absolute inset-0 size-full object-cover"
                      style={{ objectPosition: `${r.focusX}% ${r.focusY}%` }}
                    />
                    <span className="absolute inset-0" style={{ background: "rgb(20 10 12)", opacity: r.dim }} />
                  </>
                )}
                {draft.defaultRoom === id && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-trust px-2 py-0.5 text-[0.625rem] font-semibold text-white">
                    <Star className="size-3" /> Default
                  </span>
                )}
                {!r.enabled && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[0.625rem] font-semibold text-white">
                    Off
                  </span>
                )}
              </span>
              <span className="px-0.5">
                <span className="block text-sm font-semibold text-ink">{ROOM_LABEL[id]}</span>
                <span className="block text-[0.72rem] leading-snug text-muted">
                  {r.photo ? "Photo background" : ROOM_NOTE[id]}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Card variant="soft" padding="lg">
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
          <RoomPreview room={room} />

          <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">{ROOM_LABEL[selected]}</h3>
                <p className="text-[0.8125rem] text-muted">
                  {isDefault ? "Pehli baar aane wale sabko yahi theme dikhti hai." : "Theme button me ek option."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[0.8125rem] font-semibold text-ink",
                    isDefault && "opacity-60",
                  )}
                  title={isDefault ? "Default theme band nahi ho sakti — pehle doosri theme ko default banaiye." : undefined}
                >
                  <input
                    type="checkbox"
                    checked={room.enabled}
                    disabled={isDefault}
                    onChange={(e) => patch(selected, { enabled: e.target.checked })}
                    style={{ accentColor: "var(--bt-accent)" }}
                  />
                  On
                </label>
                <Button size="sm" variant="secondary" icon={<Star className="size-4" />} disabled={isDefault} onClick={() => makeDefault(selected)}>
                  {isDefault ? "Default" : "Make Default"}
                </Button>
              </div>
            </div>

            {!canHavePhoto(selected) ? (
              <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[0.8125rem] leading-relaxed text-muted">
                Classic me photo nahi lagti — ye hamesha wahi cream paper rehta hai jo bandhantak.com par live tha.
                Yahan se sirf on/off aur default tay hota hai.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="accent"
                    icon={<ImagePlus className="size-4" />}
                    loading={uploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    {room.photo ? "Replace Photo" : "Upload Photo"}
                  </Button>
                  {room.photo && (
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => patch(selected, { photo: null })}>
                      Remove Photo
                    </Button>
                  )}
                  {saved.rooms[selected].photo && !room.photo && (
                    <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => patch(selected, saved.rooms[selected])}>
                      Undo
                    </Button>
                  )}
                </div>

                {!room.photo ? (
                  <p className="text-[0.8125rem] leading-relaxed text-muted">
                    Abhi {ROOM_LABEL[selected]} ka apna drawing wala background hai. Khadi (portrait) photo lagaiye —
                    1080×2400 sabse achhi, JPG/PNG/WebP, 15MB tak. Photo lagte hi is theme ke saare cards — /bolo
                    samet — saaf, transparent glass ban jayenge.
                  </p>
                ) : (
                  <>
                    <p className="text-[0.75rem] text-subtle">
                      {room.photo.width}×{room.photo.height}px · auto dim {Math.round(room.photo.recommendedDim * 100)}%
                    </p>
                    {isSoftPhoto(room.photo) && (
                      <p className="-mt-2 inline-flex items-start gap-1.5 text-[0.75rem] leading-relaxed text-warn">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                        Ye photo phone ki screen se chhoti hai, isliye thodi soft dikh sakti hai. Tez photo ke liye
                        1080×2400 lagaiye.
                      </p>
                    )}

                    <div className="flex flex-col gap-2">
                      <Slider
                        label="Photo Dim"
                        value={Math.round(room.dim * 100)}
                        min={0}
                        max={Math.round(DIM_MAX * 100)}
                        onChange={(v) => patch(selected, { dim: v / 100 })}
                        display={`${Math.round(room.dim * 100)}%`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {contrast && <Contrast label="Body text" ratio={contrast.average} />}
                        {contrast && <Contrast label="Heading, roshan hisse par" ratio={contrast.bright} />}
                        {contrast && (
                          <span className="inline-flex items-center rounded-full border border-line px-2.5 py-1 text-[0.75rem] text-muted">
                            Glass {Math.round((1 - contrast.glass) * 100)}% gehra
                          </span>
                        )}
                        {Math.round(room.dim * 100) !== Math.round(room.photo.recommendedDim * 100) && (
                          <Button size="sm" variant="link" onClick={() => patch(selected, { dim: room.photo!.recommendedDim })}>
                            Use Recommended
                          </Button>
                        )}
                      </div>
                      <p className="text-[0.75rem] leading-relaxed text-muted">
                        Glass saaf rehta hai aur sirf apne peeche ki photo ko thoda gehra karta hai, taaki safed text
                        padha jaye. Dim kam karenge to photo zyada chamkegi aur glass apne aap thoda aur gehra ho jayega;
                        zyada karenge to glass aur saaf. 4.5:1 se upar = theek, laal = text mushkil se padha jayega.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Slider
                        label="Focus — left / right"
                        value={room.focusX}
                        min={0}
                        max={100}
                        onChange={(v) => patch(selected, { focusX: v })}
                        display={`${room.focusX}%`}
                      />
                      <Slider
                        label="Focus — up / down"
                        value={room.focusY}
                        min={0}
                        max={100}
                        onChange={(v) => patch(selected, { focusY: v })}
                        display={`${room.focusY}%`}
                      />
                    </div>
                    <p className="-mt-2 text-[0.75rem] text-muted">
                      Jab phone photo se patla ya chhota ho, to photo ka kaunsa hissa dikhe.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" disabled={!dirty || busy || uploading} onClick={() => setConfirm(true)}>
          Save Themes
        </Button>
        {dirty && (
          <>
            <span className="text-[0.8125rem] text-muted">Badlaav abhi save nahi hue: {changes.join(", ")}</span>
            <Button size="sm" variant="ghost" onClick={() => setDraft(saved)}>
              Discard
            </Button>
          </>
        )}
      </div>

      <AdminActionConfirmModal
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={save}
        title="Themes live karein?"
        description="Har user ko agli page load par naya look dikhega (zyada se zyada 30 second me). Jo theme band hogi, uspar baitha user default theme par aa jayega."
        variant={
          ROOM_IDS.some((id) => {
            const r = draft.rooms[id];
            if (!r.photo) return false;
            const c = photoContrast(r.photo, r.dim);
            return c.average < READABLE || c.bright < READABLE;
          })
            ? "warning"
            : "success"
        }
        confirmLabel="Yes, Go Live"
      />
    </div>
  );
}
