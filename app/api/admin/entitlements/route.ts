import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/db/prisma";
import { PLAN_FEATURE_TYPES } from "@/lib/constants/plans";
import { grantOverride, type CapabilityKey } from "@/lib/services/plans/entitlementOverrides";

export const runtime = "nodejs";

const CAPABILITY_KEYS = Object.keys(PLAN_FEATURE_TYPES) as [CapabilityKey, ...CapabilityKey[]];

const GrantSchema = z.object({
  userId: z.string().min(1),
  // A plain string, not an enum: plans are admin-created since 2026-08-07, so
  // there is no fixed set. `grantOverride` checks the code against the live
  // catalog, which is the only place that can know what exists.
  planCode: z.string().trim().min(2).max(24).nullable().optional(),
  capabilityKey: z.enum(CAPABILITY_KEYS).nullable().optional(),
  /** Sent as a JSON scalar so `null` (= unlimited) survives the wire intact. */
  value: z.union([z.boolean(), z.number(), z.null()]).optional(),
  reason: z.string().min(3).max(300),
  /** Days from now. Omit for a grant that does not expire. */
  expiresInDays: z.number().int().positive().max(3650).nullable().optional(),
});

/** Search for a user to grant to — email/mobile/name, capped and non-fuzzy. */
export async function GET(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ ok: true, users: [] });
  }

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { mobile: { contains: q } },
      ],
    },
    take: 10,
    orderBy: { createdAt: "desc" },
    select: { id: true, fullName: true, email: true, mobile: true, status: true },
  });

  return NextResponse.json({ ok: true, users });
}

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const parsed = GrantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const { userId, planCode, capabilityKey, value, reason, expiresInDays } = parsed.data;

  const result = await grantOverride({
    userId,
    planCode: planCode ?? null,
    capabilityKey: capabilityKey ?? null,
    value: value === undefined ? null : value,
    reason,
    expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400_000) : null,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
