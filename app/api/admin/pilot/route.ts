import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { addPilotCity, updatePilotCity } from "@/lib/services/pilot/pilotCityService";
import { setOpsSettings } from "@/lib/services/pilot/opsSettings";

export const runtime = "nodejs";

/**
 * The pilot's two kinds of dial, from one admin endpoint.
 *
 * Same shape as `/api/admin/pricing/marketplace`, and for the same reason:
 * three actions on one screen sharing one actor and one audit story are three
 * places to forget `requireAdmin` if they become three routes. Every range
 * check lives in the service, so this file only decides who may call it.
 */
const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add-city"),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    status: z.enum(["OPEN", "WAITLIST", "PAUSED"]).optional(),
    partnerCapacity: z.number().int().optional(),
    note: z.string().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("update-city"),
    id: z.string().uuid(),
    status: z.enum(["OPEN", "WAITLIST", "PAUSED"]).optional(),
    partnerCapacity: z.number().int().optional(),
    note: z.string().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("settings"),
    defaultCityPartnerCapacity: z.number().int().optional(),
    demandSignalThreshold: z.number().int().optional(),
    slaFirstReminderHours: z.number().int().optional(),
    slaFinalReminderHours: z.number().int().optional(),
    ackReminderHours: z.number().int().optional(),
    milestoneOverdueGraceDays: z.number().int().optional(),
    slaBreachEscalationCount: z.number().int().optional(),
    slaBreachWindowDays: z.number().int().optional(),
    slaAutoPauseOnEscalation: z.boolean().optional(),
    safetyFirstResponseHours: z.number().int().optional(),
  }),
]);

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Request theek nahi hai." },
      { status: 422 },
    );
  }

  const actor = { actorId: user.id, actorRole: user.role };
  const body = parsed.data;

  const result =
    body.action === "add-city"
      ? await addPilotCity(body, actor)
      : body.action === "update-city"
        ? await updatePilotCity(body.id, body, actor)
        : await setOpsSettings(body, actor);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  // `notified` is how many waitlisted people the change just wrote to. Returned
  // rather than logged: an admin who opens a city should see that the promise
  // made to those people was actually kept, on the same click.
  return NextResponse.json({ ok: true, notified: "notified" in result ? result.notified : undefined });
}
