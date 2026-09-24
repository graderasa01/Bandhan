import {
  DEFAULT_ROOM_GLASS,
  glassReadability,
  glassVars,
  otherDevice,
  resolveGlass,
  type GlassDevice,
  type GlassValues,
  type RoomGlass,
} from "@/lib/theme/glass";

/**
 * The four rooms — the looks the header's theme button cycles through — and
 * what an admin can put behind three of them: a photo per device, and the
 * glass that stands over it (lib/theme/glass.ts).
 *
 * Pure and client-safe: the root layout, the theme button, the admin screen
 * and the upload service all read the same ids and the same numbers, so the
 * page an admin previews is the page a member gets.
 *
 *   terrace  "Satin"   — the satin room, and the look the product is drawn to
 *   ivory    "Day"     — graphite and plum
 *   gold     "Night"   — lamp-lit, champagne bokeh
 *   paper    "Classic" — cream paper, wine ink; the look bandhantak.com shipped
 *
 * The id is what the `bt-glass` cookie and `data-room` on <html> carry. It is
 * no longer always the glass itself: a room with a photo wears the `/bolo`
 * glass (`PHOTO_GLASS`), so `data-glass` — which every material token reads —
 * is derived from the room rather than equal to it.
 */
export const ROOM_IDS = ["terrace", "ivory", "gold", "paper"] as const;
export type RoomId = (typeof ROOM_IDS)[number];

export const ROOM_LABEL: Record<RoomId, string> = {
  terrace: "Satin",
  ivory: "Day",
  gold: "Night",
  paper: "Classic",
};

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === "string" && (ROOM_IDS as readonly string[]).includes(value);
}

/** What a first visit gets when no room is marked default. */
export const FALLBACK_DEFAULT_ROOM: RoomId = "terrace";

/**
 * The width at which the app changes to its desktop layout — AppShell's `md:`
 * (the sidebar comes in, the bottom bar goes). The desktop photo and the
 * desktop glass start at the same width, so "Desktop" on /admin/theme means
 * exactly the screens a member sees the desktop app on. Change it there,
 * change it here.
 */
export const DESKTOP_MIN_WIDTH = 768;

/** An uploaded room photo, as the pages and the admin screen see it. */
export type RoomPhotoView = {
  id: string;
  imageUrl: string;
  backdropUrl: string;
  width: number;
  height: number;
  color: string;
  lumaMean: number;
  lumaBright: number;
  recommendedDim: number;
};

export function isLandscape(photo: Pick<RoomPhotoView, "width" | "height">): boolean {
  return photo.width > photo.height;
}

/**
 * Smaller than the screen it is for, so the screen will upscale it and it
 * will look soft. Allowed — a background mostly shows through glass — but the
 * admin screen says so before it goes live.
 */
export function isSoftPhoto(photo: Pick<RoomPhotoView, "width" | "height">, device: GlassDevice): boolean {
  return device === "desktop" ? photo.width < 1920 || photo.height < 1080 : photo.width < 1080 || photo.height < 1920;
}

/** One device's background: the photo, the scrim over it, and the point a screen crops around. */
export type RoomBackground = {
  photo: RoomPhotoView | null;
  dim: number;
  focusX: number;
  focusY: number;
};

export type RoomConfig = {
  id: RoomId;
  enabled: boolean;
  isDefault: boolean;
  /** The portrait photo, for screens under `DESKTOP_MIN_WIDTH`. */
  mobile: RoomBackground;
  /** The landscape photo, for screens from `DESKTOP_MIN_WIDTH` up. */
  desktop: RoomBackground;
  glass: RoomGlass;
};

/** All four rooms in `ROOM_IDS` order, plus the two answers every page needs. */
export type ThemeRooms = {
  rooms: RoomConfig[];
  /** The rooms the theme button cycles through, in order. Never empty. */
  enabled: RoomId[];
  defaultRoom: RoomId;
};

export const EMPTY_BACKGROUND: RoomBackground = { photo: null, dim: 0, focusX: 50, focusY: 50 };

/** The built-in state: all four on, Satin the default, drawn rooms. */
export const BUILTIN_THEME_ROOMS: ThemeRooms = {
  rooms: ROOM_IDS.map((id) => ({
    id,
    enabled: true,
    isDefault: id === FALLBACK_DEFAULT_ROOM,
    mobile: EMPTY_BACKGROUND,
    desktop: EMPTY_BACKGROUND,
    glass: DEFAULT_ROOM_GLASS,
  })),
  enabled: [...ROOM_IDS],
  defaultRoom: FALLBACK_DEFAULT_ROOM,
};

/** The room a request lands in: the one it asked for if that one is on, else the default. */
export function resolveRoom(requested: string | null | undefined, rooms: ThemeRooms): RoomId {
  return isRoomId(requested) && rooms.enabled.includes(requested) ? requested : rooms.defaultRoom;
}

/**
 * Classic is cream paper under opaque cards. It stays exactly the page it is —
 * a photo behind it would only ever show in the gutters, a picture somebody
 * left under the page.
 */
export function canHavePhoto(id: RoomId): boolean {
  return id !== "paper";
}

/** A photo room: one with a photo for either device. Both devices then show a photo. */
export function hasPhoto(room: Pick<RoomConfig, "mobile" | "desktop">): boolean {
  return Boolean(room.mobile.photo || room.desktop.photo);
}

/**
 * The glass a room wears once it has a photo. `data-glass` is set to
 * `terrace`, so every screen gets the measured `/bolo` material — and on top of
 * it "THE PHOTO ROOM" in globals.css re-cuts that material as CLEAR glass,
 * whose every number comes from lib/theme/glass.ts. The greige body the satin
 * room needs would lay a brown film over a photo — that is what "the cards
 * look black" was.
 */
export const PHOTO_GLASS: RoomId = "terrace";

/** What one device shows: a photo, and how it sits. */
export type DeviceView = RoomBackground & {
  photo: RoomPhotoView;
  /** False when the device has no photo of its own and borrows the other one's. */
  own: boolean;
};

/**
 * The photo a device shows, and with it that photo's look. A device without a
 * photo of its own borrows the other device's — together with the dim and the
 * crop it was set up with, so a room that only ever had a phone photo looks on
 * a desktop exactly as it always did. Null for a room with no photo at all.
 */
export function deviceView(room: Pick<RoomConfig, "mobile" | "desktop">, device: GlassDevice): DeviceView | null {
  const own = room[device];
  if (own.photo) return { ...own, photo: own.photo, own: true };
  const other = room[otherDevice(device)];
  return other.photo ? { ...other, photo: other.photo, own: false } : null;
}

/** The glass one device of a room gets, whoever decided it. Null without a photo — a drawn room keeps its own glass. */
export function roomGlass(room: RoomConfig, device: GlassDevice): GlassValues | null {
  const view = deviceView(room, device);
  return view ? resolveGlass(room.glass, device, view.photo, view.dim) : null;
}

/** How the glass's type measures on one device of a room — see `glassReadability`. */
export function roomReadability(room: RoomConfig, device: GlassDevice): { average: number; bright: number } | null {
  const view = deviceView(room, device);
  if (!view) return null;
  return glassReadability(view.photo, view.dim, resolveGlass(room.glass, device, view.photo, view.dim));
}

/**
 * The custom properties one device of a photo room paints from ("THE PHOTO
 * ROOM" in globals.css): the photo, its scrim and crop, how it fits a wide
 * screen, and every knob of the glass over it.
 */
export function roomDeviceVars(room: RoomConfig, device: GlassDevice): Record<`--${string}`, string> | null {
  const view = deviceView(room, device);
  if (!view) return null;
  const { photo } = view;
  const wide = isLandscape(photo);
  return {
    "--room-photo": `url("${photo.imageUrl}")`,
    "--room-backdrop": `url("${photo.backdropUrl}")`,
    "--room-photo-color": photo.color,
    "--room-dim": String(view.dim),
    "--room-focus": `${view.focusX}% ${view.focusY}%`,
    // On a screen wider than 3:4 a portrait photo is shown whole with its
    // blurred copy at the sides; a landscape photo simply covers.
    "--room-photo-wide-size": wide ? "cover" : "contain",
    "--room-photo-wide-position": wide ? `${view.focusX}% ${view.focusY}%` : "50% 50%",
    ...glassVars(resolveGlass(room.glass, device, photo, view.dim)),
  };
}

/**
 * The stylesheet one photo room needs: the phone's numbers on the room's rule,
 * and the same rule again inside the desktop media query with the desktop's.
 * Empty for a room with no photo. The root layout writes it for every photo
 * room (the theme button switches rooms without a page load), and the admin
 * preview writes the unsaved room with this same function — so the preview
 * runs the real media query too, in an iframe as wide as the device.
 */
export function themeRoomCss(room: RoomConfig): string {
  const rule = (device: GlassDevice) => {
    const vars = roomDeviceVars(room, device);
    if (!vars) return "";
    const body = Object.entries(vars)
      .map(([name, value]) => `${name}:${value}`)
      .join(";");
    return `:root[data-room="${room.id}"]{${body}}`;
  };
  const mobile = rule("mobile");
  if (!mobile) return "";
  return `${mobile}\n@media (min-width:${DESKTOP_MIN_WIDTH}px){${rule("desktop")}}`;
}
