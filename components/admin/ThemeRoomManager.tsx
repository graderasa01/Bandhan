"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Smartphone, SlidersHorizontal, Star } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import GlassControlPanel from "@/components/admin/GlassControlPanel";
import RoomBackgroundPanel from "@/components/admin/RoomBackgroundPanel";
import RoomPreview from "@/components/admin/RoomPreview";
import { cn } from "@/lib/utils";
import {
  GLASS_DEVICES,
  GLASS_DEVICE_LABEL,
  READABLE,
  type GlassDevice,
  type GlassPreset,
  type RoomGlass,
} from "@/lib/theme/glass";
import {
  ROOM_IDS,
  ROOM_LABEL,
  canHavePhoto,
  deviceView,
  hasPhoto,
  roomReadability,
  type RoomBackground,
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

function backgroundPayload(background: RoomBackground) {
  return {
    photoId: background.photo?.id ?? null,
    dim: background.dim,
    focusX: background.focusX,
    focusY: background.focusY,
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
        mobile: backgroundPayload(room.mobile),
        desktop: backgroundPayload(room.desktop),
        glass: room.glass,
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

/** A stand-in for the drawn room on a tile. The preview shows the real one. */
const ROOM_SWATCH: Record<RoomId, CSSProperties> = {
  terrace: { background: "linear-gradient(160deg, #f0d2ab 0%, #a87a5f 30%, #5c3a22 58%, #5c1420 82%, #2a0710 100%)" },
  ivory: { background: "linear-gradient(162deg, #9a5634 0%, #6c3427 38%, #512a23 64%, #8a4a2e 100%)" },
  gold: { background: "radial-gradient(70% 40% at 78% 6%, #d9a45a 0%, transparent 70%), linear-gradient(170deg, #3a2410 0%, #1b0f07 100%)" },
  paper: { background: "linear-gradient(180deg, #fffdf9 0%, #f6efe4 100%)" },
};

const DEVICE_ICON: Record<GlassDevice, typeof Smartphone> = { mobile: Smartphone, desktop: Monitor };

/**
 * The four rooms of the theme button, for an admin: which are on, which one a
 * first visit gets, and — for Satin, Day and Night — the photos that replace
 * the drawn background (one for phones, one for the desktop app) and the
 * glass over them, auto or set by hand, separately per device. Classic is
 * never given a photo.
 *
 * Nothing here is live until "Save Themes". An upload only processes and
 * stores the photo; the preview shows the unsaved state on a real phone- or
 * desktop-sized screen, with the contrast the glass's type will have.
 */
export default function ThemeRoomManager({
  initial,
  initialPresets,
}: {
  initial: ThemeRooms;
  initialPresets: GlassPreset[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const saved = useMemo(() => toDraft(initial), [initial]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [selected, setSelected] = useState<RoomId>(initial.defaultRoom);
  const [device, setDevice] = useState<GlassDevice>("mobile");
  const [presets, setPresets] = useState<GlassPreset[]>(initialPresets);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const payload = useMemo(() => toPayload(draft), [draft]);
  const savedPayload = useMemo(() => toPayload(saved), [saved]);
  const dirty = JSON.stringify(payload) !== JSON.stringify(savedPayload);
  const room = draft.rooms[selected];
  const isDefault = draft.defaultRoom === selected;

  function patch(id: RoomId, change: Partial<RoomConfig>) {
    setDraft((d) => ({ ...d, rooms: { ...d.rooms, [id]: { ...d.rooms[id], ...change } } }));
  }

  function patchBackground(id: RoomId, target: GlassDevice, change: Partial<RoomBackground>) {
    setDraft((d) => ({
      ...d,
      rooms: { ...d.rooms, [id]: { ...d.rooms[id], [target]: { ...d.rooms[id][target], ...change } } },
    }));
  }

  function patchGlass(id: RoomId, glass: RoomGlass) {
    patch(id, { glass });
  }

  function makeDefault(id: RoomId) {
    // A default that is switched off would send every first visit to a room
    // the button cannot reach, so making one default also switches it on.
    setDraft((d) => ({ defaultRoom: id, rooms: { ...d.rooms, [id]: { ...d.rooms[id], enabled: true } } }));
  }

  /** A photo arriving on a device starts at the dim it was measured to need; the glass is left exactly as it is. */
  function attachPhoto(id: RoomId, target: GlassDevice, photo: RoomPhotoView) {
    patchBackground(id, target, { photo, dim: photo.recommendedDim, focusX: 50, focusY: 50 });
  }

  async function upload(file: File) {
    const [targetRoom, targetDevice] = [selected, device];
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("device", targetDevice);
      const res = await fetch("/api/admin/theme/rooms/photo", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast({ title: "Photo upload nahi hui", description: json?.message, tone: "error" });
        return;
      }
      attachPhoto(targetRoom, targetDevice, json.photo as RoomPhotoView);
      toast({
        title: `${ROOM_LABEL[targetRoom]} ki ${GLASS_DEVICE_LABEL[targetDevice]} photo taiyaar`,
        description: "Preview dekh lijiye — Save Themes dabane par hi live hogi.",
        tone: "success",
      });
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/theme/rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    const [a, b] = [payload.rooms, savedPayload.rooms].map((rooms) => rooms.find((r) => r.id === id));
    return JSON.stringify(a) !== JSON.stringify(b);
  }).map((id) => ROOM_LABEL[id]);
  if (draft.defaultRoom !== saved.defaultRoom) changes.push(`Default → ${ROOM_LABEL[draft.defaultRoom]}`);

  const unreadable = ROOM_IDS.some((id) =>
    GLASS_DEVICES.some((d) => {
      const r = roomReadability(draft.rooms[id], d);
      return r !== null && (r.average < READABLE || r.bright < READABLE);
    }),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ROOM_IDS.map((id) => {
          const r = draft.rooms[id];
          const active = id === selected;
          const shown = deviceView(r, "mobile");
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
              <span className="relative block aspect-[9/14] overflow-hidden rounded-lg" style={shown ? undefined : ROOM_SWATCH[id]}>
                {shown && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of the stored, re-encoded room photo */}
                    <img
                      src={shown.photo.imageUrl}
                      alt=""
                      className="absolute inset-0 size-full object-cover"
                      style={{ objectPosition: `${shown.focusX}% ${shown.focusY}%` }}
                    />
                    <span className="absolute inset-0" style={{ background: "rgb(20 10 12)", opacity: shown.dim }} />
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
                {hasPhoto(r) && r.glass.mode === "manual" && (
                  <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[0.625rem] font-semibold text-white">
                    <SlidersHorizontal className="size-3" /> Manual glass
                  </span>
                )}
              </span>
              <span className="px-0.5">
                <span className="block text-sm font-semibold text-ink">{ROOM_LABEL[id]}</span>
                <span className="block text-[0.72rem] leading-snug text-muted">
                  {!hasPhoto(r)
                    ? ROOM_NOTE[id]
                    : r.mobile.photo && r.desktop.photo
                      ? "Mobile + Desktop photo"
                      : r.desktop.photo
                        ? "Desktop photo"
                        : "Mobile photo"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Card variant="soft" padding="lg">
        <div className="flex flex-col gap-5">
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
              Classic me photo nahi lagti — ye hamesha wahi cream paper rehta hai jo bandhantak.com par live tha, isliye
              iska glass bhi nahi badalta. Yahan se sirf on/off aur default tay hota hai.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-full border border-line-strong bg-surface p-1" role="group" aria-label="Device">
                  {GLASS_DEVICES.map((d) => {
                    const Icon = DEVICE_ICON[d];
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={device === d}
                        onClick={() => setDevice(d)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[0.8125rem] font-semibold transition-colors",
                          device === d ? "bg-accent text-accent-fg shadow-sm" : "text-muted hover:text-ink",
                        )}
                      >
                        <Icon className="size-4" />
                        {GLASS_DEVICE_LABEL[d]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[0.75rem] text-muted">
                  Mobile aur Desktop ki photo aur glass alag-alag save hote hain — preview wahi screen dikhata hai jo chuni hai.
                </p>
              </div>

              <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div
                  className={cn(
                    "w-full shrink-0 lg:sticky lg:top-20",
                    device === "mobile" ? "lg:w-[260px]" : "lg:w-[46%]",
                  )}
                >
                  <RoomPreview room={room} device={device} />
                  <p className="mt-2 text-center text-[0.72rem] text-subtle">
                    {GLASS_DEVICE_LABEL[device]} preview · live, abhi save nahi hua
                  </p>
                </div>

                <div className="flex w-full min-w-0 flex-1 flex-col gap-6">
                  <RoomBackgroundPanel
                    room={room}
                    saved={saved.rooms[selected]}
                    device={device}
                    uploading={uploading}
                    onUpload={(file) => void upload(file)}
                    onPick={(photo) => attachPhoto(selected, device, photo)}
                    onChange={(change) => patchBackground(selected, device, change)}
                  />
                  <div className="border-t border-line" />
                  <GlassControlPanel
                    room={room}
                    device={device}
                    presets={presets}
                    onGlassChange={(glass) => patchGlass(selected, glass)}
                    onPresetsChange={setPresets}
                  />
                </div>
              </div>
            </>
          )}
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
        description={
          unreadable
            ? "Kisi theme me glass par text 4.5:1 se kam padh raha hai (preview ke peele chips dekhiye). Aap phir bhi live kar sakte hain. Har user ko agli page load par naya look dikhega (zyada se zyada 30 second me)."
            : "Har user ko agli page load par naya look dikhega (zyada se zyada 30 second me). Jo theme band hogi, uspar baitha user default theme par aa jayega."
        }
        variant={unreadable ? "warning" : "success"}
        confirmLabel="Yes, Go Live"
      />
    </div>
  );
}
