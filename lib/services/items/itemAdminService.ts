import "server-only";
import type { Role, ServiceItemKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isBuiltinServiceItemCode, parseItemConfig } from "@/lib/constants/serviceItems";
import { getItemCatalog, invalidateItemCatalog, type ServiceItemEntry } from "./itemCatalog";

/**
 * The admin side of the à-la-carte catalog — the reason `service_items` is a
 * table and not a constant.
 *
 * Every write goes through `upsertItem`, and it is an *upsert* rather than a
 * create/update pair because a built-in item has no row until the first time
 * someone edits it. Splitting the two would mean the admin screen had to know
 * which items are "real" yet, and getting that wrong writes a duplicate code
 * or fails on a save that looked identical to the one before it.
 */

export interface AdminItemRow extends ServiceItemEntry {
  /** How many payments have ever named this code — the delete guard. */
  purchaseCount: number;
}

export async function listItemsForAdmin(): Promise<AdminItemRow[]> {
  const [catalog, counts] = await Promise.all([
    getItemCatalog(),
    prisma.payment.groupBy({ by: ["itemCode"], where: { itemCode: { not: null } }, _count: { _all: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.itemCode as string, c._count._all]));
  return catalog.all.map((item) => ({ ...item, purchaseCount: countOf.get(item.code) ?? 0 }));
}

export interface UpsertItemInput {
  code: string;
  name: string;
  description: string;
  priceInPaise: number;
  kind: ServiceItemKind;
  config: unknown;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: number;
  actorId: string;
  actorRole: Role;
}

export type ItemWriteResult = { ok: true; code: string } | { ok: false; message: string; status: number };

export async function upsertItem(input: UpsertItemInput): Promise<ItemWriteResult> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,40}$/.test(code)) {
    return { ok: false, message: "Code sirf BADE letters, numbers aur _ se banega.", status: 422 };
  }
  if (!input.name.trim()) return { ok: false, message: "Naam likhna zaroori hai.", status: 422 };
  if (!input.description.trim()) {
    return { ok: false, message: "Ek line ka description likhna zaroori hai — user ko yahi dikhta hai.", status: 422 };
  }
  if (!Number.isInteger(input.priceInPaise) || input.priceInPaise <= 0) {
    // Zero is refused here as well as at the till: `availabilityOf` will not
    // sell a ₹0 item, so saving one would produce a card nobody can buy.
    return { ok: false, message: "Daam 0 se zyada hona chahiye.", status: 422 };
  }

  const parsed = parseItemConfig(input.kind, input.config);
  if (!parsed.ok) return { ok: false, message: parsed.message, status: 422 };

  const existing = await prisma.serviceItem.findUnique({ where: { code } });

  /*
   * The kind is frozen once anyone has paid.
   *
   * A captured payment's fulfilment is decided by the kind at capture time.
   * Letting an ENTITLEMENT_WINDOW become an AI_DELIVERABLE afterwards would
   * make every past `Payment.itemCode` point at a product that no longer
   * describes what was actually delivered — and the receipt screen reads the
   * live catalog.
   */
  if (existing && existing.kind !== input.kind) {
    const paid = await prisma.payment.count({ where: { itemCode: code, status: "CAPTURED" } });
    if (paid > 0) {
      return { ok: false, message: "Ispar payment aa chuki hai — ab iska kind nahi badla ja sakta.", status: 409 };
    }
  }

  const data = {
    name: input.name.trim(),
    description: input.description.trim(),
    priceInPaise: input.priceInPaise,
    kind: input.kind,
    config: parsed.config as object,
    isActive: input.isActive,
    isPublic: input.isPublic,
    displayOrder: input.displayOrder,
    updatedBy: input.actorId,
  };

  await prisma.$transaction(async (tx) => {
    await tx.serviceItem.upsert({ where: { code }, create: { code, ...data }, update: data });
    await tx.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        actionType: existing ? "SERVICE_ITEM_UPDATED" : "SERVICE_ITEM_CREATED",
        targetType: "service_item",
        targetId: code,
        previousValue: existing ? `${existing.priceInPaise}p active=${existing.isActive}` : null,
        newValue: `${data.priceInPaise}p active=${data.isActive}`,
      },
    });
  });

  invalidateItemCatalog();
  return { ok: true, code };
}

/**
 * Deletes an admin-created item that nobody has ever bought.
 *
 * A built-in cannot be deleted (its definition lives in code and would simply
 * reappear), and neither can one with payments against it — `Payment.itemCode`
 * is how a receipt still knows what was sold. Both cases are switched off with
 * `isActive` instead, which is what "delete" means for anything that has taken
 * money.
 */
export async function deleteItem(code: string, actorId: string, actorRole: Role): Promise<ItemWriteResult> {
  const upper = code.trim().toUpperCase();
  if (isBuiltinServiceItemCode(upper)) {
    return { ok: false, message: "Ye built-in item hai — ise band kar sakte hain, hata nahi sakte.", status: 409 };
  }

  const [row, used] = await Promise.all([
    prisma.serviceItem.findUnique({ where: { code: upper } }),
    prisma.payment.count({ where: { itemCode: upper } }),
  ]);
  if (!row) return { ok: false, message: "Aisa koi item nahi hai.", status: 404 };
  if (used > 0) {
    return { ok: false, message: "Ispar payment ho chuki hai — ise sirf band kiya ja sakta hai.", status: 409 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceItem.delete({ where: { code: upper } });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "SERVICE_ITEM_DELETED",
        targetType: "service_item",
        targetId: upper,
        previousValue: `${row.priceInPaise}p`,
      },
    });
  });

  invalidateItemCatalog();
  return { ok: true, code: upper };
}
