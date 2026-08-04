import { NextResponse } from "next/server";
import { z } from "zod";
import { callAi } from "@/lib/ai/providers";
import { mapAiError } from "@/lib/ai/routeError";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { candidateSummary } from "@/lib/services/match/explain";
import type { ReelIcebreakerResponse } from "@/lib/contracts/reel";

export const runtime = "nodejs";

const ICEBREAKER_SYSTEM_PROMPT = `Aap BandhanTak ke liye ek matchmaking assistant hain. User ne abhi kisi profile ko interest bheja hai. Aapka kaam hai ek chhota, respectful "opening message" likhna jo interest ke saath bheja ja sake — aap kabhi decide nahi karte ki interest bhejna hai ya nahi, wo pehle se ho chuka hai.

Rules:
- Sirf diye gaye fields ka use karein. Kabhi kuch mat banayein (invent) jo diya nahi gaya.
- 1-2 chhoti lines, warm aur genuine — generic "Hi, how are you" nahi, kam se kam ek cheez profile se reference kijiye (jaise shared interest, city, ya profession) agar data me ho.
- Kabhi flirty ya casual dating-app tone nahi istemal karein — ye matrimony hai, respectful family context me.
- Hinglish me likhiye.`;

const ICEBREAKER_SCHEMA = {
  type: "object",
  properties: { suggestion: { type: "string" } },
  required: ["suggestion"],
  additionalProperties: false,
};

function bad(
  code: "not_configured" | "upstream_error" | "bad_request",
  message: string,
  status: number,
) {
  return NextResponse.json({ ok: false, code, message } satisfies ReelIcebreakerResponse, { status });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: { profileId?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request", "Request JSON padha nahi ja saka.", 400);
  }
  if (!body.profileId) return bad("bad_request", "Profile chahiye.", 400);

  const [viewer, candidate] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: user.id }, include: PROFILE_FULL_INCLUDE }),
    prisma.profile.findUnique({ where: { id: body.profileId }, include: PROFILE_FULL_INCLUDE }),
  ]);
  if (!viewer || !candidate) return bad("bad_request", "Profile nahi mila.", 400);

  const result = await callAi({
    configFeature: "icebreaker",
    logFeature: "reel_icebreaker",
    userId: user.id,
    system: ICEBREAKER_SYSTEM_PROMPT,
    content: JSON.stringify({ viewer: candidateSummary(viewer), candidate: candidateSummary(candidate) }),
    maxTokens: 300,
    jsonSchema: ICEBREAKER_SCHEMA,
    schemaName: "icebreaker",
  });

  if (!result.ok) {
    if (result.kind === "upstream_error") console.error("[ai:reel_icebreaker] failed:", result.message);
    const { status, code } = mapAiError(result.kind);
    return bad(code, result.kind === "upstream_error" ? "Suggestion nahi ban paaya." : result.message, status);
  }

  const parsed = JSON.parse(result.text) as { suggestion?: string };
  if (!parsed.suggestion) return bad("upstream_error", "AI se koi suggestion nahi mila.", 502);

  return NextResponse.json({ ok: true, suggestion: parsed.suggestion.trim() } satisfies ReelIcebreakerResponse);
}

const PatchSchema = z.object({
  profileId: z.string().min(1),
  message: z.string().min(1).max(300),
});

/** Attaches the (possibly edited) suggestion to the Interest row `/api/reel/swipe` already created. */
export async function PATCH(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("bad_request", "Request JSON padha nahi ja saka.", 400);
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return bad("bad_request", parsed.error.issues[0]?.message ?? "Message aur profile dono chahiye.", 422);
  }

  const candidate = await prisma.profile.findUnique({
    where: { id: parsed.data.profileId },
    select: { userId: true },
  });
  if (!candidate) return bad("bad_request", "Profile nahi mila.", 400);

  const interest = await prisma.interest.findUnique({
    where: { fromUserId_toUserId: { fromUserId: user.id, toUserId: candidate.userId } },
  });
  if (!interest) return bad("bad_request", "Pehle interest bhejna zaroori hai.", 404);

  await prisma.interest.update({
    where: { id: interest.id },
    data: { message: parsed.data.message },
  });

  return NextResponse.json({ ok: true } satisfies ReelIcebreakerResponse);
}
