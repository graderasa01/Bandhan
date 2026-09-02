import "server-only";
import { z } from "zod";
import {
  MAX_REQUEST_NOTE_CHARS,
  MAX_REQUEST_PLACE_CHARS,
  MIN_REQUEST_NOTE_CHARS,
} from "./roomCollabPolicy";
import { completeRoomTask } from "./roomTaskService";
import { raiseRequest, withdrawRequest } from "./roomRequestService";
import type { RoomAccess } from "./roomParticipantService";

/**
 * Everything a helper may do inside a room, in one place.
 *
 * Two auth worlds reach these actions — a partner with a login and a family
 * member with a token-bound portal session — and they must stay two worlds:
 * `requirePartner` and `requireFamilyMember` read different cookies and enforce
 * different things. What must *not* be two is the list of actions themselves.
 * A family route that grew a fourth action the partner route never got, or a
 * permission check written slightly differently on one side, is exactly the
 * drift this module exists to prevent.
 *
 * So the routes stay thin: authenticate, resolve `RoomAccess` against that
 * identity, hand the body here. Every permission decision below reads off the
 * resolved access, which was itself recomputed from the live delegation.
 */

export const HelperActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request-raise"),
    kind: z.enum(["FAMILY_INTRO", "CALL", "MEETING"]),
    note: z.string().min(MIN_REQUEST_NOTE_CHARS).max(MAX_REQUEST_NOTE_CHARS),
    proposedFor: z.string().datetime().optional(),
    proposedPlace: z.string().max(MAX_REQUEST_PLACE_CHARS).optional(),
  }),
  z.object({ action: z.literal("request-withdraw"), requestId: z.string().uuid() }),
  z.object({ action: z.literal("task-done"), taskId: z.string().uuid(), done: z.boolean() }),
]);

export type HelperAction = z.infer<typeof HelperActionSchema>;

export type HelperActionResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

export async function runHelperAction(
  access: RoomAccess,
  body: HelperAction,
  actorUserId: string | null,
): Promise<HelperActionResult> {
  if (body.action === "request-raise") {
    const result = await raiseRequest(access, {
      kind: body.kind,
      note: body.note,
      proposedFor: body.proposedFor ? new Date(body.proposedFor) : null,
      proposedPlace: body.proposedPlace ?? null,
      actorUserId,
    });
    return result.ok ? { ok: true } : result;
  }

  if (body.action === "request-withdraw") {
    const result = await withdrawRequest(access, body.requestId);
    return result.ok ? { ok: true } : result;
  }

  // Only the helper's own task, enforced inside the service against the same
  // participant id the session resolved — not the one the body asked for.
  const result = await completeRoomTask({ access }, body.taskId, body.done);
  return result.ok ? { ok: true } : result;
}
