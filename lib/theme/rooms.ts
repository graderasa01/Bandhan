import { contrastRatio } from "@/lib/theme/contrast";

/**
 * The four rooms — the looks the header's theme button cycles through — and
 * the arithmetic that keeps a photo behind the glass readable.
 *
 * Pure and client-safe: the root layout, the theme button, the admin screen
 * and the upload service all read the same ids and the same numbers, so the
 * contrast an admin is shown before saving is the contrast the upload was
 * judged by.
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

/**
 * Smaller than a phone's screen in device pixels, so a phone will upscale it
 * and it will look soft. Allowed — a background mostly shows through glass —
 * but the admin screen says so before it goes live.
 */
export function isSoftPhoto(photo: Pick<RoomPhotoView, "width" | "height">): boolean {
  return photo.width < 1080 || photo.height < 1920;
}

/** How a photo sits in its room: the scrim, and the point a phone crops around. */
export type RoomLook = { dim: number; focusX: number; focusY: number };

export type RoomConfig = RoomLook & {
  id: RoomId;
  enabled: boolean;
  isDefault: boolean;
  photo: RoomPhotoView | null;
};

/** All four rooms in `ROOM_IDS` order, plus the two answers every page needs. */
export type ThemeRooms = {
  rooms: RoomConfig[];
  /** The rooms the theme button cycles through, in order. Never empty. */
  enabled: RoomId[];
  defaultRoom: RoomId;
};

/** The built-in state: all four on, Satin the default, drawn rooms. */
export const BUILTIN_THEME_ROOMS: ThemeRooms = {
  rooms: ROOM_IDS.map((id) => ({
    id,
    enabled: true,
    isDefault: id === FALLBACK_DEFAULT_ROOM,
    photo: null,
    dim: 0,
    focusX: 50,
    focusY: 50,
  })),
  enabled: [...ROOM_IDS],
  defaultRoom: FALLBACK_DEFAULT_ROOM,
};

/** The room a request lands in: the one it asked for if that one is on, else the default. */
export function resolveRoom(requested: string | null | undefined, rooms: ThemeRooms): RoomId {
  return isRoomId(requested) && rooms.enabled.includes(requested) ? requested : rooms.defaultRoom;
}

/**
 * The custom properties a photo room paints from (globals.css, "THE PHOTO
 * ROOM"): the photo, its scrim and crop, and how dark the clear glass goes
 * over it (`--room-glass`, from `glassFor`). One source for both places that
 * set them: the root layout's per-room rules and the admin preview.
 */
export function roomPhotoVars(photo: RoomPhotoView, look: RoomLook): Record<`--${string}`, string> {
  return {
    "--room-photo": `url("${photo.imageUrl}")`,
    "--room-backdrop": `url("${photo.backdropUrl}")`,
    "--room-photo-color": photo.color,
    "--room-dim": String(look.dim),
    "--room-focus": `${look.focusX}% ${look.focusY}%`,
    "--room-glass": String(glassFor(photo, look.dim)),
  };
}

/**
 * Classic is cream paper under opaque cards. It stays exactly the page it is —
 * a photo behind it would only ever show in the gutters, a picture somebody
 * left under the page.
 */
export function canHavePhoto(id: RoomId): boolean {
  return id !== "paper";
}

/**
 * The glass a room wears once it has a photo. `data-glass` is set to
 * `terrace`, so every screen gets the measured `/bolo` material — and on top of
 * it "THE PHOTO ROOM" in globals.css re-cuts that material as CLEAR glass: a
 * body that is almost nothing (white at ~10%), a strong blur with the colour
 * turned up, and the photo darkened behind the pane only (`--glass-vibrancy`).
 * The greige body the satin room needs would lay a brown film over a photo —
 * that is what "the cards look black" was.
 */
export const PHOTO_GLASS: RoomId = "terrace";

/** How far a photo may be dimmed. Past this it has stopped being a photo. */
export const DIM_MAX = 0.85;

/** Body text's bar — the same 4.5:1 D-21 holds every other colour to. */
export const READABLE = 4.5;

/* The clear glass, as THE PHOTO ROOM block in globals.css cuts it. Kept in
   step by hand — change one, change both.

   PANE_WHITE   the heaviest body type sits on (`--glass-alpha-strong`, the
                app's cards), so the sums are never kinder than the page.
   GLASS_MIN    the darkest the glass may go (`brightness()` behind the pane).
                Below this a pane stops reading as glass and reads as smoke.
   GLASS_LOOK   how light a pane over the photo's ordinary tone is allowed to
                sit (Rec.601 luma). Keeps every photo's glass the same
                material rather than bright on one photo and murky on the
                next.
   GLASS_CLEAR  what `recommendDim` aims for: the photo dimmed just enough that
                the glass can stay at least this clear. */
const PANE_WHITE = 0.13;
const GLASS_MIN = 0.5;
const GLASS_LOOK = 96;
const GLASS_CLEAR = 0.62;
/** The scrim — the satin room's deepest wine. Same value as `.photo-room__scrim`. */
const SCRIM = [20, 10, 12] as const;
/** `--text-primary`, and `--text-secondary`'s white at 88%, on that glass. */
const TEXT_PRIMARY = "#ffffff";
const TEXT_SECONDARY_ALPHA = 0.88;

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The pane over a patch of photo of this luma: the scrim takes `dim` of the
 * photo, the glass darkens what is left to `glass`, and the white body lies on
 * top. The photo is treated as a grey of its own luma — luma is what decides
 * whether white type on it reads.
 */
function paneOver(luma: number, dim: number, glass: number): number[] {
  return SCRIM.map((scrim) => {
    const behind = luma * (1 - dim) + scrim * dim;
    return behind * glass * (1 - PANE_WHITE) + 255 * PANE_WHITE;
  });
}

function contrastOn(pane: number[]) {
  const secondary = pane.map((c) => 255 * TEXT_SECONDARY_ALPHA + c * (1 - TEXT_SECONDARY_ALPHA));
  return {
    primary: contrastRatio(TEXT_PRIMARY, toHex(pane)),
    secondary: contrastRatio(toHex(secondary), toHex(pane)),
  };
}

export type PhotoLuma = { lumaMean: number; lumaBright: number };

/**
 * How dark the glass goes behind itself over this photo at this dim
 * (`brightness()`, 0.5 .. 1): as clear as it can be while type on it still
 * reads. A dark photo gets clear glass (1); a bright sky gets a pane that
 * takes the light out of what is behind it. Written into the page as
 * `--room-glass`, so the admin's one slider — the photo's dim — is the only
 * choice: dim the photo less and the glass works harder, more and it clears.
 */
export function glassFor(photo: PhotoLuma, dim: number): number {
  for (let step = 100; step >= GLASS_MIN * 100; step--) {
    const glass = step / 100;
    const ordinary = paneOver(photo.lumaMean, dim, glass);
    const bright = paneOver(photo.lumaBright, dim, glass);
    const lookOk = 0.299 * ordinary[0] + 0.587 * ordinary[1] + 0.114 * ordinary[2] <= GLASS_LOOK;
    if (lookOk && contrastOn(ordinary).secondary >= READABLE && contrastOn(bright).primary >= READABLE) return glass;
  }
  return GLASS_MIN;
}

/**
 * What the glass's type measures over the photo at a given dim, with the glass
 * at `glassFor(photo, dim)`:
 *
 *   average  body text (`--text-secondary`) over the photo's mean — most of a
 *            screen is paragraphs standing over the photo's ordinary tone.
 *   bright   headings (`--text-primary`) over the brightest patch a pane can
 *            stand on (`lumaBright`) — the sky, a haze band, a white dress —
 *            where a pane lands lightest.
 */
export function photoContrast(photo: PhotoLuma, dim: number): { average: number; bright: number; glass: number } {
  const glass = glassFor(photo, dim);
  return {
    average: contrastOn(paneOver(photo.lumaMean, dim, glass)).secondary,
    bright: contrastOn(paneOver(photo.lumaBright, dim, glass)).primary,
    glass,
  };
}

/**
 * The least dim at which the glass can stay clear (`GLASS_CLEAR`) and type on
 * it still clears 4.5:1, in steps of 0.01. A dark photo needs none; a bright
 * one is taken back exactly as far as it has to be. Capped at `DIM_MAX`: a
 * photo that fails even there is a photo to replace, and the admin screen
 * says so rather than burying it under a black veil.
 */
export function recommendDim(photo: PhotoLuma): number {
  const steps = Math.round(DIM_MAX * 100);
  for (let step = 0; step <= steps; step++) {
    const dim = step / 100;
    const { average, bright, glass } = photoContrast(photo, dim);
    if (glass >= GLASS_CLEAR && average >= READABLE && bright >= READABLE) return dim;
  }
  return DIM_MAX;
}
