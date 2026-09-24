import { z } from "zod";
import { DIM_MAX, GLASS_CONTROLS, GLASS_DEVICES, GLASS_MODES, type GlassKnob } from "@/lib/theme/glass";
import { ROOM_IDS } from "@/lib/theme/rooms";

/**
 * What /admin/theme sends: the rooms (both devices' photos and the glass over
 * them) and glass presets. Built from `GLASS_CONTROLS`, so a knob added there
 * is validated here with no second list to keep in step.
 */

const knobs = Object.fromEntries(
  GLASS_CONTROLS.map((control) => [
    control.key,
    z
      .number()
      .min(control.min, `${control.label} ${control.min}${control.unit} se kam nahi ho sakta.`)
      .max(control.max, `${control.label} ${control.max}${control.unit} se zyada nahi ho sakta.`),
  ]),
) as Record<GlassKnob, z.ZodNumber>;

export const GlassValuesSchema = z.object({
  ...knobs,
  tint: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Tint ka rang #rrggbb hona chahiye."),
});

export const RoomGlassSchema = z.object({
  mode: z.enum(GLASS_MODES),
  mobile: GlassValuesSchema.nullable(),
  desktop: GlassValuesSchema.nullable(),
});

const BackgroundSchema = z.object({
  // The sha256 an upload returned — never a URL. The URL is looked up from the
  // photo row, so nothing a client sends is ever written into a stylesheet.
  photoId: z.string().regex(/^[0-9a-f]{64}$/, "Photo id valid nahi hai.").nullable(),
  dim: z.number().min(0).max(DIM_MAX),
  focusX: z.number().int().min(0).max(100),
  focusY: z.number().int().min(0).max(100),
});

export const RoomUpdateSchema = z.object({
  id: z.enum(ROOM_IDS),
  enabled: z.boolean(),
  mobile: BackgroundSchema,
  desktop: BackgroundSchema,
  glass: RoomGlassSchema,
});

export const ThemeRoomsPutSchema = z.object({
  rooms: z.array(RoomUpdateSchema).length(ROOM_IDS.length),
  defaultRoom: z.enum(ROOM_IDS),
});

export const GlassDeviceSchema = z.enum(GLASS_DEVICES);

export const GlassPresetSaveSchema = z.object({
  /** Omitted to add a new preset; a preset's id to overwrite it. */
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1, "Preset ka naam chahiye.").max(32, "Naam 32 akshar se chhota rakhein."),
  values: GlassValuesSchema,
});

export const GlassPresetDefaultSchema = z.object({
  defaultId: z.string().min(1).max(64),
});
