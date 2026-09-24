import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import type { Role, ThemeGlassPreset } from "@prisma/client";
import {
  BUILTIN_GLASS_PRESETS,
  BUILTIN_PRESET_IDS,
  DEFAULT_PRESET_ID,
  normalizeGlass,
  type GlassPreset,
  type GlassValues,
} from "@/lib/theme/glass";

/**
 * The glass presets on /admin/theme — "Default", "Soft Glass", "Clear Glass",
 * "Strong Glass", and whatever an admin saves from the sliders.
 *
 * The four built-ins live in code (`BUILTIN_GLASS_PRESETS`) and get a row only
 * once an admin changes one, so deleting a built-in's row is "Restore
 * original". Custom presets are rows and nothing else. Exactly one preset is
 * the default — what Reset goes back to; with no row marked, the built-in
 * "default" is.
 *
 * A preset is a library entry, not a live setting: applying one only fills
 * the sliders, and nothing reaches a member until the rooms are saved. Each
 * change is still written to the audit log.
 */

/** A cap on the library, so it stays a short list of chips rather than a second settings page. */
const MAX_CUSTOM_PRESETS = 20;
const NAME_MAX = 32;

export type GlassPresetResult =
  | { ok: true; presets: GlassPreset[] }
  | { ok: false; error: string; message: string; status: number };

function build(rows: ThemeGlassPreset[]): GlassPreset[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const builtIns: GlassPreset[] = BUILTIN_GLASS_PRESETS.map((preset) => {
    const row = byId.get(preset.id);
    return {
      id: preset.id,
      name: row?.name ?? preset.name,
      values: row ? normalizeGlass(row.values, preset.values) : preset.values,
      builtIn: true,
      edited: Boolean(row),
      isDefault: false,
    };
  });
  const custom: GlassPreset[] = rows
    .filter((row) => !BUILTIN_PRESET_IDS.has(row.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      name: row.name,
      values: normalizeGlass(row.values),
      builtIn: false,
      edited: false,
      isDefault: false,
    }));
  const all = [...builtIns, ...custom];
  const marked = rows.find((row) => row.isDefault)?.id;
  const defaultId = all.some((preset) => preset.id === marked) ? marked : DEFAULT_PRESET_ID;
  return all.map((preset) => ({ ...preset, isDefault: preset.id === defaultId }));
}

/** Every preset, built-ins first, then the admin's own in the order they were saved. */
export async function getGlassPresets(): Promise<GlassPreset[]> {
  return build(await prisma.themeGlassPreset.findMany());
}

function slug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `${base || "preset"}-${randomBytes(3).toString("hex")}`;
}

async function audit(actorId: string, actorRole: Role, targetId: string, previous: unknown, next: unknown) {
  await prisma.adminAuditLog.create({
    data: {
      actorId,
      actorRole,
      actionType: "THEME_GLASS_PRESET_UPDATED",
      targetType: "theme_glass_preset",
      targetId,
      previousValue: previous === null ? null : JSON.stringify(previous),
      newValue: next === null ? null : JSON.stringify(next),
    },
  });
}

/**
 * Saves a preset from the sliders. With an `id` it overwrites that preset —
 * a built-in included, which is how "Update Soft Glass" works; without one it
 * adds a new preset under the given name.
 */
export async function saveGlassPreset(params: {
  id?: string;
  name: string;
  values: GlassValues;
  actorId: string;
  actorRole: Role;
}): Promise<GlassPresetResult> {
  const name = params.name.trim().slice(0, NAME_MAX);
  if (!name) return { ok: false, error: "VALIDATION_FAILED", message: "Preset ka naam chahiye.", status: 422 };
  const values = normalizeGlass(params.values);
  const existing = await prisma.themeGlassPreset.findMany();
  const current = build(existing);

  let id = params.id;
  if (id) {
    const target = current.find((preset) => preset.id === id);
    if (!target) return { ok: false, error: "NOT_FOUND", message: "Ye preset ab maujood nahi hai.", status: 404 };
    await prisma.themeGlassPreset.upsert({
      where: { id },
      create: { id, name, values, updatedBy: params.actorId },
      update: { name, values, updatedBy: params.actorId },
    });
    await audit(params.actorId, params.actorRole, id, { name: target.name, values: target.values }, { name, values });
  } else {
    const customCount = current.filter((preset) => !preset.builtIn).length;
    if (customCount >= MAX_CUSTOM_PRESETS) {
      return {
        ok: false,
        error: "LIMIT_REACHED",
        message: `Zyada se zyada ${MAX_CUSTOM_PRESETS} apne presets — pehle koi purana delete karein.`,
        status: 422,
      };
    }
    id = slug(name);
    await prisma.themeGlassPreset.create({ data: { id, name, values, updatedBy: params.actorId } });
    await audit(params.actorId, params.actorRole, id, null, { name, values });
  }

  return { ok: true, presets: await getGlassPresets() };
}

/** Makes one preset the default — what Reset on /admin/theme goes back to. */
export async function setDefaultGlassPreset(params: { id: string; actorId: string; actorRole: Role }): Promise<GlassPresetResult> {
  const current = await getGlassPresets();
  const target = current.find((preset) => preset.id === params.id);
  if (!target) return { ok: false, error: "NOT_FOUND", message: "Ye preset ab maujood nahi hai.", status: 404 };
  const before = current.find((preset) => preset.isDefault)?.id ?? DEFAULT_PRESET_ID;

  await prisma.$transaction(async (tx) => {
    await tx.themeGlassPreset.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    // A built-in that has no row yet gets one to carry the mark — with its
    // values as they stand, so marking it changes nothing else about it.
    await tx.themeGlassPreset.upsert({
      where: { id: target.id },
      create: { id: target.id, name: target.name, values: target.values, isDefault: true, updatedBy: params.actorId },
      update: { isDefault: true, updatedBy: params.actorId },
    });
  });
  await audit(params.actorId, params.actorRole, target.id, { default: before }, { default: target.id });
  return { ok: true, presets: await getGlassPresets() };
}

/**
 * Deletes a custom preset, or restores a built-in to the values it shipped
 * with. Either way, if it was the default, the built-in "Default" becomes the
 * default again.
 */
export async function deleteGlassPreset(params: { id: string; actorId: string; actorRole: Role }): Promise<GlassPresetResult> {
  const current = await getGlassPresets();
  const target = current.find((preset) => preset.id === params.id);
  if (!target) return { ok: false, error: "NOT_FOUND", message: "Ye preset ab maujood nahi hai.", status: 404 };
  if (target.builtIn && !target.edited) {
    return { ok: true, presets: current };
  }
  await prisma.themeGlassPreset.delete({ where: { id: target.id } });
  await audit(
    params.actorId,
    params.actorRole,
    target.id,
    { name: target.name, values: target.values, default: target.isDefault },
    target.builtIn ? { restored: true } : null,
  );
  return { ok: true, presets: await getGlassPresets() };
}
