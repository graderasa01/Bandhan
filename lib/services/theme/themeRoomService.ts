import "server-only";
import { createHash } from "crypto";
import sharp, { type Metadata, type OutputInfo } from "sharp";
import { prisma } from "@/lib/db/prisma";
import { Prisma, type Role, type ThemeRoom, type ThemeRoomPhoto } from "@prisma/client";
import {
  BUILTIN_THEME_ROOMS,
  FALLBACK_DEFAULT_ROOM,
  ROOM_IDS,
  canHavePhoto,
  isLandscape,
  themeRoomCss,
  type RoomBackground,
  type RoomConfig,
  type RoomId,
  type RoomPhotoView,
  type ThemeRooms,
} from "@/lib/theme/rooms";
import {
  DEFAULT_ROOM_GLASS,
  DIM_MAX,
  normalizeGlass,
  parseRoomGlass,
  recommendDim,
  type GlassDevice,
  type RoomGlass,
} from "@/lib/theme/glass";
import { putThemeRoomObject } from "./themeRoomStorage";

/**
 * The four rooms of the theme button — which are on, which one a first visit
 * gets, the photos an admin put behind Satin, Day or Night (one for phones,
 * one for the desktop app) and the glass over them (/admin/theme).
 *
 * Read on every page render by the root layout, so it has the same shape as
 * `siteThemeService`: an in-process cache with a short TTL, and a read path
 * that never throws — a DB hiccup falls back to the built-in rooms, which is
 * the product exactly as it shipped.
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; rooms: ThemeRooms } | null = null;

type RoomRow = ThemeRoom & { photo: ThemeRoomPhoto | null; desktopPhoto: ThemeRoomPhoto | null };

const ROOM_INCLUDE = { photo: true, desktopPhoto: true } as const;

/* A photo's URLs are written into a stylesheet (`url("…")` in the root
   layout's <style>), so they are held to a shape that cannot close the string,
   the rule or the tag: an optional http(s) origin, then a plain path. Every URL
   this module stores is one it built itself; this is the check that keeps it
   so. */
const SAFE_URL = /^(?:https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?)?\/[A-Za-z0-9._~/-]+$/;
const SAFE_HEX = /^#[0-9a-f]{6}$/i;

function toPhotoView(photo: ThemeRoomPhoto): RoomPhotoView | null {
  if (!SAFE_URL.test(photo.imageUrl) || !SAFE_URL.test(photo.backdropUrl) || !SAFE_HEX.test(photo.color)) {
    console.error("[theme-rooms] photo", photo.id, "has a URL or colour this module did not write — ignored");
    return null;
  }
  return {
    id: photo.id,
    imageUrl: photo.imageUrl,
    backdropUrl: photo.backdropUrl,
    width: photo.width,
    height: photo.height,
    color: photo.color.toLowerCase(),
    lumaMean: photo.lumaMean,
    lumaBright: photo.lumaBright,
    recommendedDim: recommendDim(photo),
  };
}

const clampDim = (dim: number) => Math.min(DIM_MAX, Math.max(0, Math.round(dim * 100) / 100));
const clampPct = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

function background(photo: ThemeRoomPhoto | null, dim: number, focusX: number, focusY: number): RoomBackground {
  return {
    photo: photo ? toPhotoView(photo) : null,
    dim: clampDim(dim),
    focusX: clampPct(focusX),
    focusY: clampPct(focusY),
  };
}

function buildRooms(rows: RoomRow[]): ThemeRooms {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const rooms: RoomConfig[] = ROOM_IDS.map((id) => {
    const row = byId.get(id);
    // Classic never shows a photo, even one a hand-edited row points at —
    // and so never has glass of its own either.
    const photos = canHavePhoto(id);
    return {
      id,
      enabled: row?.enabled ?? true,
      isDefault: row?.isDefault ?? false,
      mobile: background(photos ? (row?.photo ?? null) : null, row?.dim ?? 0, row?.focusX ?? 50, row?.focusY ?? 50),
      desktop: background(
        photos ? (row?.desktopPhoto ?? null) : null,
        row?.desktopDim ?? 0,
        row?.desktopFocusX ?? 50,
        row?.desktopFocusY ?? 50,
      ),
      glass: photos ? parseRoomGlass(row?.glass) : DEFAULT_ROOM_GLASS,
    };
  });

  // `saveThemeRooms` never lets every room go off; this is for a table
  // somebody edited by hand, so the button always has somewhere to be.
  let enabled = rooms.filter((room) => room.enabled).map((room) => room.id);
  if (enabled.length === 0) enabled = [FALLBACK_DEFAULT_ROOM];

  const marked = rooms.find((room) => room.isDefault && enabled.includes(room.id));
  const defaultRoom = marked?.id ?? (enabled.includes(FALLBACK_DEFAULT_ROOM) ? FALLBACK_DEFAULT_ROOM : enabled[0]);

  return {
    rooms: rooms.map((room) => ({ ...room, isDefault: room.id === defaultRoom })),
    enabled,
    defaultRoom,
  };
}

async function loadRows(): Promise<RoomRow[]> {
  return prisma.themeRoom.findMany({ include: ROOM_INCLUDE });
}

/** The live rooms every page render applies — cached, never throws. */
export async function getThemeRooms(): Promise<ThemeRooms> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rooms;
  try {
    const rooms = buildRooms(await loadRows());
    cache = { at: Date.now(), rooms };
    return rooms;
  } catch (err) {
    console.error(
      "[theme-rooms] DB read failed, falling back to the built-in rooms:",
      err instanceof Error ? err.message : String(err),
    );
    return BUILTIN_THEME_ROOMS;
  }
}

/** For the admin page — always fresh, never the in-process cache. */
export async function getThemeRoomsForAdmin(): Promise<ThemeRooms> {
  return buildRooms(await loadRows());
}

/**
 * The rules that hand each photo room its photos and glass — phone numbers on
 * `:root[data-room=…]`, desktop numbers on the same rule inside the desktop
 * media query (`themeRoomCss`), written into a <style> in the root layout.
 * All of them ship, not just the current room's: the theme button switches
 * rooms without a page load, and the new room's photo has to be one attribute
 * away. A browser only fetches the image whose rule matches.
 */
export function themeRoomsCss(rooms: ThemeRooms): string {
  return rooms.rooms
    .map(themeRoomCss)
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------ upload */

export class RoomPhotoError extends Error {
  readonly code:
    | "TOO_LARGE"
    | "NOT_AN_IMAGE"
    | "UNSUPPORTED_FORMAT"
    | "TOO_SMALL"
    | "NOT_PORTRAIT"
    | "NOT_LANDSCAPE"
    | "DECODE_FAILED";
  constructor(code: RoomPhotoError["code"], message: string) {
    super(message);
    this.name = "RoomPhotoError";
    this.code = code;
  }
}

export const ROOM_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const INPUT_PIXEL_LIMIT = 60_000_000;

/**
 * What each device's photo has to be, and what is stored of it.
 *
 *   mobile   portrait. A phone is ~1080 device pixels wide; more is bytes
 *            nobody sees. 4:5 is the squarest a phone background can be and
 *            still fill a phone.
 *   desktop  landscape. 2400px covers a 1440px laptop at 2x within reason;
 *            6:5 is the squarest that still reads as a landscape on a monitor.
 *
 * The minimums are floors, not recommendations: a background mostly shows
 * through glass, which softens it anyway, so a smaller photo is the admin's
 * call — the admin screen says when one will look soft (`isSoftPhoto`). Below
 * these it would be a smear on any screen.
 *
 * `blurShare` is how wide the glass's 24px blur is next to that screen — ~6%
 * of a phone, ~1.7% of a laptop — which `brightestPatch` blurs the photo by
 * before it looks for the brightest patch a pane can stand on.
 */
const DEVICE_PHOTO = {
  mobile: { width: 1080, maxHeight: 2400, minWidth: 600, minHeight: 800, quality: 82, sample: 90, blurShare: 5 / 90 },
  desktop: { width: 2400, maxHeight: 1600, minWidth: 1280, minHeight: 720, quality: 80, sample: 160, blurShare: 3 / 160 },
} as const;
/** Width over height: a phone photo may be at most this square… */
const MAX_PORTRAIT_ASPECT = 0.8;
/** …and a desktop photo at least this wide. */
const MIN_LANDSCAPE_ASPECT = 1.2;

export type ProcessedRoomPhoto = {
  image: Buffer;
  backdrop: Buffer;
  width: number;
  height: number;
  color: string;
  lumaMean: number;
  lumaBright: number;
};

/**
 * Decode → check → re-encode → measure. What is stored is a fresh WebP this
 * module wrote — never the uploaded bytes — so a file that only claims to be
 * an image (SVG, HTML, a polyglot) never reaches a visitor's browser, and
 * EXIF (location, camera) is dropped on the way.
 *
 * Measured on a small copy: Rec.601 luma, the same number the satin room was
 * measured in, so "mean 58" means the same thing here as in globals.css.
 */
export async function processRoomPhoto(input: Buffer, device: GlassDevice = "mobile"): Promise<ProcessedRoomPhoto> {
  const spec = DEVICE_PHOTO[device];
  if (input.length === 0) throw new RoomPhotoError("NOT_AN_IMAGE", "Khaali file.");
  if (input.length > ROOM_PHOTO_MAX_BYTES) {
    throw new RoomPhotoError("TOO_LARGE", `File ${Math.round(ROOM_PHOTO_MAX_BYTES / 1024 / 1024)}MB se badi nahi ho sakti.`);
  }

  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: "error", limitInputPixels: INPUT_PIXEL_LIMIT }).metadata();
  } catch {
    throw new RoomPhotoError("NOT_AN_IMAGE", "File image ki tarah khul nahi rahi (corrupt, ya SVG/HTML jaisi koi aur cheez).");
  }
  const format = meta.format ?? "";
  if (!ACCEPTED_FORMATS.has(format)) {
    throw new RoomPhotoError("UNSUPPORTED_FORMAT", "Sirf JPG, PNG ya WebP photo chalegi.");
  }

  // EXIF orientations 5-8 are quarter turns: the stored width is the height.
  // The shape is checked before the size: a phone photo dropped on the
  // desktop slot is the wrong photo, not a small one, and saying "too small"
  // would send the admin looking for a bigger copy of it.
  const turned = (meta.orientation ?? 1) >= 5;
  const width = (turned ? meta.height : meta.width) ?? 0;
  const height = (turned ? meta.width : meta.height) ?? 0;
  if (device === "mobile" && (height === 0 || width / height > MAX_PORTRAIT_ASPECT)) {
    throw new RoomPhotoError(
      "NOT_PORTRAIT",
      `${width}×${height}px khadi (portrait) nahi hai — phone ke liye lambi photo chahiye, jaise 1080×2400. Leti hui (landscape) photo Desktop tab me lagaiye.`,
    );
  }
  if (device === "desktop" && (height === 0 || width / height < MIN_LANDSCAPE_ASPECT)) {
    throw new RoomPhotoError(
      "NOT_LANDSCAPE",
      `${width}×${height}px leti hui (landscape) nahi hai — desktop ke liye chaudi photo chahiye, jaise 2560×1440. Khadi photo Mobile tab me lagaiye.`,
    );
  }
  if (width < spec.minWidth || height < spec.minHeight) {
    throw new RoomPhotoError(
      "TOO_SMALL",
      device === "desktop"
        ? `${width}×${height}px bahut chhoti hai — desktop ke liye kam se kam ${spec.minWidth}×${spec.minHeight}px chahiye (2560×1440 best).`
        : `${width}×${height}px bahut chhoti hai — kam se kam ${spec.minWidth}×${spec.minHeight}px chahiye (1080×2400 best).`,
    );
  }

  let image: { data: Buffer; info: OutputInfo };
  try {
    image = await sharp(input, { failOn: "error", limitInputPixels: INPUT_PIXEL_LIMIT })
      .rotate()
      .resize({ width: spec.width, height: spec.maxHeight, fit: "inside", withoutEnlargement: true })
      // A transparent PNG would show the page's flash colour through its
      // holes; flatten onto the satin room's own ground instead.
      .flatten({ background: "#2a161a" })
      .webp({ quality: spec.quality, effort: 5 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new RoomPhotoError("DECODE_FAILED", "Photo process nahi ho payi — doosri file try karein.");
  }

  // The placeholder while the photo loads, and the side fill on a screen
  // wider than a phone photo. Tiny and pre-blurred: stretched by the browser
  // it stays smooth, and no page ever pays for a live `filter: blur()`.
  const backdrop = await sharp(image.data)
    .resize({ width: device === "desktop" ? 128 : 72 })
    .blur(1.6)
    .webp({ quality: 60 })
    .toBuffer();

  const sample = await sharp(image.data).resize({ width: spec.sample }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = sample;
  let r = 0;
  let g = 0;
  let b = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n += 1;
  }
  const hex = (c: number) => Math.round(c / n).toString(16).padStart(2, "0");

  return {
    image: image.data,
    backdrop,
    width: image.info.width,
    height: image.info.height,
    color: `#${hex(r)}${hex(g)}${hex(b)}`,
    lumaMean: Math.round((sum / n) * 10) / 10,
    lumaBright: await brightestPatch(image.data, spec.sample, spec.sample * spec.blurShare),
  };
}

/**
 * The brightest patch a pane can stand over, as the pane sees it: the photo
 * blurred by the same share of its width as the glass blurs the screen, and
 * the 98th percentile read off that. A raw percentile over-reads a speck of
 * glare no pane ever shows; the blurred one is the haze band or the sky a card
 * really sits on. Measured on the first photo put in a room: its raw 90th
 * percentile (211) sat 20 below the patch behind /bolo's question card, which
 * is why the recommended dim came out too light.
 */
async function brightestPatch(photo: Buffer, width: number, sigma: number): Promise<number> {
  const { data, info } = await sharp(photo)
    .resize({ width })
    .blur(Math.max(0.3, sigma))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lumas: number[] = [];
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    lumas.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  lumas.sort((x, y) => x - y);
  return Math.round(lumas[Math.min(lumas.length - 1, Math.floor(lumas.length * 0.98))] * 10) / 10;
}

/**
 * Processes, stores and records one photo. Changes nothing live: a room has
 * to be pointed at it by `saveThemeRooms`, which is the admin's Save after the
 * preview. The same file uploaded twice is one row.
 */
export async function uploadRoomPhoto(params: {
  buffer: Buffer;
  actorId: string;
  device: GlassDevice;
}): Promise<RoomPhotoView> {
  const processed = await processRoomPhoto(params.buffer, params.device);
  const id = createHash("sha256").update(processed.image).digest("hex");

  // Written even when the row exists: a local-disk copy does not survive a
  // wiped checkout, and rewriting the same bytes under the same name is free.
  const [imageUrl, backdropUrl] = await Promise.all([
    putThemeRoomObject(`${id}.webp`, processed.image, "image/webp"),
    putThemeRoomObject(`${id}-backdrop.webp`, processed.backdrop, "image/webp"),
  ]);

  const data = {
    imageUrl,
    backdropUrl,
    width: processed.width,
    height: processed.height,
    color: processed.color,
    lumaMean: processed.lumaMean,
    lumaBright: processed.lumaBright,
  };
  const row = await prisma.themeRoomPhoto.upsert({
    where: { id },
    create: { id, ...data, createdBy: params.actorId },
    update: data,
  });

  const view = toPhotoView(row);
  if (!view) throw new RoomPhotoError("DECODE_FAILED", "Photo ka URL save nahi ho paya — storage config check karein.");
  return view;
}

/**
 * Photos already uploaded, newest first, for "Choose from Library" — only the
 * ones shaped for the device asked about (portrait for phones, landscape for
 * desktops), so a photo can be moved between rooms without uploading it again.
 */
export async function listRoomPhotos(device: GlassDevice, limit = 24): Promise<RoomPhotoView[]> {
  const rows = await prisma.themeRoomPhoto.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return rows
    .map(toPhotoView)
    .filter((photo): photo is RoomPhotoView => photo !== null && isLandscape(photo) === (device === "desktop"))
    .slice(0, limit);
}

/* -------------------------------------------------------------------- save */

export type BackgroundUpdate = {
  photoId: string | null;
  dim: number;
  focusX: number;
  focusY: number;
};

export type RoomUpdate = {
  id: RoomId;
  enabled: boolean;
  mobile: BackgroundUpdate;
  desktop: BackgroundUpdate;
  glass: RoomGlass;
};

export type ThemeRoomsSaveResult = { ok: true } | { ok: false; error: string; message: string; status: number };

function summarise(rooms: ThemeRooms): string {
  const photo = (b: RoomBackground) => (b.photo ? b.photo.id.slice(0, 12) : null);
  return JSON.stringify({
    default: rooms.defaultRoom,
    rooms: Object.fromEntries(
      rooms.rooms.map((room) => [
        room.id,
        {
          on: room.enabled,
          photo: photo(room.mobile),
          dim: room.mobile.dim,
          desktopPhoto: photo(room.desktop),
          desktopDim: room.desktop.dim,
          glass: room.glass.mode,
        },
      ]),
    ),
  });
}

/** What a room's `glass` column holds: null for auto with nothing set, else every number clamped. */
function storedGlass(glass: RoomGlass): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (glass.mode === "auto" && !glass.mobile && !glass.desktop) return Prisma.DbNull;
  return {
    mode: glass.mode,
    mobile: glass.mobile ? normalizeGlass(glass.mobile) : null,
    desktop: glass.desktop ? normalizeGlass(glass.desktop) : null,
  };
}

/**
 * All four rooms in one write, so "exactly one default, and it is on" holds
 * after every save. The rules a visitor depends on are checked here, not in
 * the form: at least one room on, the default on, no photo behind Classic,
 * every photo one this module stored and shaped for its device, and a manual
 * glass that has numbers for both devices.
 */
export async function saveThemeRooms(params: {
  rooms: RoomUpdate[];
  defaultRoom: RoomId;
  actorId: string;
  actorRole: Role;
}): Promise<ThemeRoomsSaveResult> {
  const { rooms, defaultRoom, actorId, actorRole } = params;
  const invalid = (message: string): ThemeRoomsSaveResult => ({ ok: false, error: "VALIDATION_FAILED", message, status: 422 });

  const ids = new Set(rooms.map((room) => room.id));
  if (rooms.length !== ROOM_IDS.length || ids.size !== ROOM_IDS.length) {
    return invalid("Chaaron themes ek saath save hoti hain.");
  }
  const on = rooms.filter((room) => room.enabled);
  if (on.length === 0) return invalid("Kam se kam ek theme on rehni chahiye.");
  if (!on.some((room) => room.id === defaultRoom)) return invalid("Default theme on honi chahiye.");
  if (rooms.some((room) => (room.mobile.photoId || room.desktop.photoId) && !canHavePhoto(room.id))) {
    return invalid("Classic par photo nahi lagti — wo bina photo ke hi rehta hai.");
  }
  if (rooms.some((room) => room.glass.mode === "manual" && (!room.glass.mobile || !room.glass.desktop))) {
    return invalid("Manual glass me Mobile aur Desktop dono ki values chahiye.");
  }

  const photoIds = [
    ...new Set(rooms.flatMap((room) => [room.mobile.photoId, room.desktop.photoId]).filter((id): id is string => Boolean(id))),
  ];
  if (photoIds.length > 0) {
    const found = await prisma.themeRoomPhoto.findMany({
      where: { id: { in: photoIds } },
      select: { id: true, width: true, height: true },
    });
    if (found.length !== photoIds.length) {
      return { ok: false, error: "PHOTO_NOT_FOUND", message: "Photo nahi mili — dobara upload karein.", status: 404 };
    }
    const shape = new Map(found.map((photo) => [photo.id, isLandscape(photo)]));
    if (rooms.some((room) => room.mobile.photoId && shape.get(room.mobile.photoId))) {
      return invalid("Mobile ke liye khadi (portrait) photo chahiye.");
    }
    if (rooms.some((room) => room.desktop.photoId && !shape.get(room.desktop.photoId))) {
      return invalid("Desktop ke liye leti hui (landscape) photo chahiye.");
    }
  }

  const before = buildRooms(await loadRows());

  await prisma.$transaction(async (tx) => {
    for (const room of rooms) {
      const photos = canHavePhoto(room.id);
      const data = {
        enabled: room.enabled,
        isDefault: room.id === defaultRoom,
        photoId: room.mobile.photoId,
        dim: clampDim(room.mobile.dim),
        focusX: clampPct(room.mobile.focusX),
        focusY: clampPct(room.mobile.focusY),
        desktopPhotoId: room.desktop.photoId,
        desktopDim: clampDim(room.desktop.dim),
        desktopFocusX: clampPct(room.desktop.focusX),
        desktopFocusY: clampPct(room.desktop.focusY),
        glass: photos ? storedGlass(room.glass) : Prisma.DbNull,
        updatedBy: actorId,
      };
      await tx.themeRoom.upsert({ where: { id: room.id }, create: { id: room.id, ...data }, update: data });
    }

    const after = buildRooms(await tx.themeRoom.findMany({ include: ROOM_INCLUDE }));
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "THEME_ROOMS_UPDATED",
        targetType: "theme_rooms",
        targetId: "all",
        previousValue: summarise(before),
        newValue: summarise(after),
      },
    });
  });

  cache = null;
  return { ok: true };
}
