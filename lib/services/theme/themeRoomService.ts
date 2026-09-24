import "server-only";
import { createHash } from "crypto";
import sharp, { type Metadata, type OutputInfo } from "sharp";
import { prisma } from "@/lib/db/prisma";
import type { Role, ThemeRoom, ThemeRoomPhoto } from "@prisma/client";
import {
  BUILTIN_THEME_ROOMS,
  DIM_MAX,
  FALLBACK_DEFAULT_ROOM,
  ROOM_IDS,
  canHavePhoto,
  recommendDim,
  roomPhotoVars,
  type RoomConfig,
  type RoomId,
  type RoomPhotoView,
  type ThemeRooms,
} from "@/lib/theme/rooms";
import { putThemeRoomObject } from "./themeRoomStorage";

/**
 * The four rooms of the theme button — which are on, which one a first visit
 * gets, and the photo an admin put behind Satin, Day or Night (/admin/theme).
 *
 * Read on every page render by the root layout, so it has the same shape as
 * `siteThemeService`: an in-process cache with a short TTL, and a read path
 * that never throws — a DB hiccup falls back to the built-in rooms, which is
 * the product exactly as it shipped.
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; rooms: ThemeRooms } | null = null;

type RoomRow = ThemeRoom & { photo: ThemeRoomPhoto | null };

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

function buildRooms(rows: RoomRow[]): ThemeRooms {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const rooms: RoomConfig[] = ROOM_IDS.map((id) => {
    const row = byId.get(id);
    return {
      id,
      enabled: row?.enabled ?? true,
      isDefault: row?.isDefault ?? false,
      // Classic never shows a photo, even one a hand-edited row points at.
      photo: row?.photo && canHavePhoto(id) ? toPhotoView(row.photo) : null,
      dim: clampDim(row?.dim ?? 0),
      focusX: clampPct(row?.focusX ?? 50),
      focusY: clampPct(row?.focusY ?? 50),
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
  return prisma.themeRoom.findMany({ include: { photo: true } });
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
 * The rules that hand each photo room its photo — one `:root[data-room=…]`
 * rule per room that has one, written into a <style> in the root layout.
 * All of them ship, not just the current room's: the theme button switches
 * rooms without a page load, and the new room's photo has to be one attribute
 * away. A browser only fetches the image whose rule matches.
 */
export function themeRoomsCss(rooms: ThemeRooms): string {
  return rooms.rooms
    .filter((room) => room.photo)
    .map((room) => {
      const vars = Object.entries(roomPhotoVars(room.photo!, room))
        .map(([name, value]) => `${name}:${value}`)
        .join(";");
      return `:root[data-room="${room.id}"]{${vars}}`;
    })
    .join("\n");
}

/* ------------------------------------------------------------------ upload */

export class RoomPhotoError extends Error {
  readonly code: "TOO_LARGE" | "NOT_AN_IMAGE" | "UNSUPPORTED_FORMAT" | "TOO_SMALL" | "NOT_PORTRAIT" | "DECODE_FAILED";
  constructor(code: RoomPhotoError["code"], message: string) {
    super(message);
    this.name = "RoomPhotoError";
    this.code = code;
  }
}

export const ROOM_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const INPUT_PIXEL_LIMIT = 60_000_000;
/** A phone is ~1080 device pixels wide; more is bytes nobody sees. */
const PHONE_WIDTH = 1080;
const PHONE_MAX_HEIGHT = 2400;
/* The floor, not the recommendation. A background mostly shows through glass,
   which softens it anyway, so a smaller photo is the admin's call — the admin
   screen says when one will look soft (`isSoftPhoto` in lib/theme/rooms.ts).
   Below this it would be a smear on any phone. */
const MIN_WIDTH = 600;
const MIN_HEIGHT = 800;
/** Width over height. 4:5 is the squarest a phone background can be and still fill a phone. */
const MAX_ASPECT = 0.8;

export type ProcessedRoomPhoto = {
  phone: Buffer;
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
 * Measured on a 90px-wide copy: Rec.601 luma, the same number the satin room
 * was measured in, so "mean 58" means the same thing here as in globals.css.
 */
export async function processRoomPhoto(input: Buffer): Promise<ProcessedRoomPhoto> {
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
  const turned = (meta.orientation ?? 1) >= 5;
  const width = (turned ? meta.height : meta.width) ?? 0;
  const height = (turned ? meta.width : meta.height) ?? 0;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    throw new RoomPhotoError(
      "TOO_SMALL",
      `${width}×${height}px bahut chhoti hai — kam se kam ${MIN_WIDTH}×${MIN_HEIGHT}px chahiye (1080×2400 best).`,
    );
  }
  if (height === 0 || width / height > MAX_ASPECT) {
    throw new RoomPhotoError("NOT_PORTRAIT", `${width}×${height}px khadi (portrait) nahi hai — phone ke liye lambi photo chahiye, jaise 1080×2400.`);
  }

  let phone: { data: Buffer; info: OutputInfo };
  try {
    phone = await sharp(input, { failOn: "error", limitInputPixels: INPUT_PIXEL_LIMIT })
      .rotate()
      .resize({ width: PHONE_WIDTH, height: PHONE_MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
      // A transparent PNG would show the page's flash colour through its
      // holes; flatten onto the satin room's own ground instead.
      .flatten({ background: "#2a161a" })
      .webp({ quality: 82, effort: 5 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new RoomPhotoError("DECODE_FAILED", "Photo process nahi ho payi — doosri file try karein.");
  }

  // The placeholder while the photo loads, and the side fill on a screen
  // wider than the photo. Tiny and pre-blurred: stretched by the browser it
  // stays smooth, and no page ever pays for a live `filter: blur()`.
  const backdrop = await sharp(phone.data).resize({ width: 72 }).blur(1.6).webp({ quality: 60 }).toBuffer();

  const sample = await sharp(phone.data).resize({ width: 90 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
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
    phone: phone.data,
    backdrop,
    width: phone.info.width,
    height: phone.info.height,
    color: `#${hex(r)}${hex(g)}${hex(b)}`,
    lumaMean: Math.round((sum / n) * 10) / 10,
    lumaBright: await brightestPatch(phone.data),
  };
}

/**
 * The brightest patch a pane can stand over, as the pane sees it. The glass
 * blurs at 24px, which on a phone is ~6% of the screen's width — so the photo
 * is blurred by the same share of its own width first (sigma 5 on a 90px
 * copy) and the 98th percentile read off that. A raw percentile over-reads a
 * speck of glare no pane ever shows; the blurred one is the haze band or the
 * sky a card really sits on. Measured on the first photo put in a room: its
 * raw 90th percentile (211) sat 20 below the patch behind /bolo's question
 * card, which is why the recommended dim came out too light.
 */
async function brightestPatch(photo: Buffer): Promise<number> {
  const { data, info } = await sharp(photo).resize({ width: 90 }).blur(5).removeAlpha().raw().toBuffer({ resolveWithObject: true });
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
 * phone preview. The same file uploaded twice is one row.
 */
export async function uploadRoomPhoto(params: { buffer: Buffer; actorId: string }): Promise<RoomPhotoView> {
  const processed = await processRoomPhoto(params.buffer);
  const id = createHash("sha256").update(processed.phone).digest("hex");

  // Written even when the row exists: a local-disk copy does not survive a
  // wiped checkout, and rewriting the same bytes under the same name is free.
  const [imageUrl, backdropUrl] = await Promise.all([
    putThemeRoomObject(`${id}.webp`, processed.phone, "image/webp"),
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

/* -------------------------------------------------------------------- save */

export type RoomUpdate = {
  id: RoomId;
  enabled: boolean;
  photoId: string | null;
  dim: number;
  focusX: number;
  focusY: number;
};

export type ThemeRoomsSaveResult = { ok: true } | { ok: false; error: string; message: string; status: number };

function summarise(rooms: ThemeRooms): string {
  return JSON.stringify({
    default: rooms.defaultRoom,
    rooms: Object.fromEntries(
      rooms.rooms.map((room) => [
        room.id,
        { on: room.enabled, photo: room.photo ? room.photo.id.slice(0, 12) : null, dim: room.dim },
      ]),
    ),
  });
}

/**
 * All four rooms in one write, so "exactly one default, and it is on" holds
 * after every save. The rules a visitor depends on are checked here, not in
 * the form: at least one room on, the default on, no photo behind Classic, and
 * every photo one this module stored.
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
  if (rooms.some((room) => room.photoId && !canHavePhoto(room.id))) {
    return invalid("Classic par photo nahi lagti — wo bina photo ke hi rehta hai.");
  }

  const photoIds = [...new Set(rooms.map((room) => room.photoId).filter((id): id is string => Boolean(id)))];
  if (photoIds.length > 0) {
    const found = await prisma.themeRoomPhoto.count({ where: { id: { in: photoIds } } });
    if (found !== photoIds.length) {
      return { ok: false, error: "PHOTO_NOT_FOUND", message: "Photo nahi mili — dobara upload karein.", status: 404 };
    }
  }

  const before = buildRooms(await loadRows());

  await prisma.$transaction(async (tx) => {
    for (const room of rooms) {
      const data = {
        enabled: room.enabled,
        isDefault: room.id === defaultRoom,
        photoId: room.photoId,
        dim: clampDim(room.dim),
        focusX: clampPct(room.focusX),
        focusY: clampPct(room.focusY),
        updatedBy: actorId,
      };
      await tx.themeRoom.upsert({ where: { id: room.id }, create: { id: room.id, ...data }, update: data });
    }

    const after = buildRooms(await tx.themeRoom.findMany({ include: { photo: true } }));
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
