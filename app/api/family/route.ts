import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { inviteFamilyMember, listFamilyMembers } from "@/lib/services/family/familyService";

export const runtime = "nodejs";

const BodySchema = z.object({
  displayName: z.string().trim().min(1, "Naam chahiye.").max(40),
  relation: z.enum(["PARENT", "SIBLING", "GUARDIAN"]),
});

function withUrl(req: Request, token: string) {
  return new URL(`/f/${token}`, new URL(req.url).origin).toString();
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const result = await inviteFamilyMember(user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json(
    { ok: true, member: { ...result.member, inviteUrl: withUrl(req, result.member.inviteToken) } },
    { status: 201 },
  );
}

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const members = await listFamilyMembers(user.id);
  return NextResponse.json({
    ok: true,
    members: members.map((m) => ({ ...m, inviteUrl: withUrl(req, m.inviteToken) })),
  });
}
