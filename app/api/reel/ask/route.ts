import { NextResponse } from "next/server";
import { callAi } from "@/lib/ai/providers";
import { mapAiError } from "@/lib/ai/routeError";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { ageFromDate } from "@/lib/services/match/age";
import { FREE_TIER_AI_ASK_LIMIT, getTodayAiAskCount } from "@/lib/ai/quota";
import type { ReelAskResponse } from "@/lib/contracts/reel";

export const runtime = "nodejs";

const ASK_SYSTEM_PROMPT = `Aap BandhanTak ke Rishta Reel ka "AI se poocho" assistant hain. User ek doosre profile (candidate) ke baare me poochta hai. Aapke paas sirf candidate ke public-safe fields hain — inhi se jawab dijiye.

Rules:
- Kabhi kuch mat banayein jo diya nahi gaya.
- Agar user private cheez poochta hai (income, phone, exact date of birth, caste/gotra) to bataiye ye private hai aur sirf mutual interest ke baad hi share hoti hai.
- Agar jawab data me nahi hai to saaf bata dijiye ki "ye jaankari abhi available nahi hai".
- Respectful, short, Hinglish jawab dijiye — 2-3 sentences se zyada nahi.`;

function bad(
  code: "not_configured" | "upstream_error" | "bad_request" | "quota_exceeded",
  message: string,
  status: number,
  quota?: { used: number; limit: number },
) {
  return NextResponse.json({ ok: false, code, message, quota } satisfies ReelAskResponse, { status });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: { profileId?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request", "Request JSON padha nahi ja saka.", 400);
  }
  if (!body.profileId || !body.question?.trim()) {
    return bad("bad_request", "Profile aur sawaal dono chahiye.", 400);
  }

  // Quota check first — DB-only, so it's testable without a live AI key and
  // doesn't waste a paid call on a request that's already over the limit.
  const used = await getTodayAiAskCount(user.id);
  if (used >= FREE_TIER_AI_ASK_LIMIT) {
    return bad(
      "quota_exceeded",
      `Aaj ke ${FREE_TIER_AI_ASK_LIMIT} sawaal ho gaye. Basic me 15 milte hain.`,
      429,
      { used, limit: FREE_TIER_AI_ASK_LIMIT },
    );
  }

  const candidate = await prisma.profile.findUnique({
    where: { id: body.profileId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (!candidate) return bad("bad_request", "Profile nahi mila.", 400);

  // §23.3 — only what's allowed to be visible to a viewer ever reaches the prompt.
  const safeFields = {
    age: ageFromDate(candidate.dateOfBirth),
    city: candidate.currentCity,
    maritalStatus: candidate.maritalStatus,
    education: candidate.education?.highestEducation ?? null,
    profession: candidate.profession?.jobTitle ?? null,
    familyType: candidate.family?.familyType ?? null,
    diet: candidate.lifestyle?.diet ?? null,
    smoking: candidate.lifestyle?.smoking ?? null,
    drinking: candidate.lifestyle?.drinking ?? null,
    hobbies: candidate.lifestyle?.hobbies ?? [],
    languagesKnown: candidate.lifestyle?.languagesKnown ?? [],
    relocateWilling: candidate.lifestyle?.relocateWilling ?? null,
    aboutMe: candidate.bioText,
  };

  const result = await callAi({
    configFeature: "askProfile",
    logFeature: "reel_ask",
    userId: user.id,
    system: ASK_SYSTEM_PROMPT,
    content: `Candidate data: ${JSON.stringify(safeFields)}\n\nSawaal: ${body.question}`,
    maxTokens: 400,
  });

  // A call that actually reached the provider (success or a billed refusal)
  // counts against today's quota; a config/rate-limit failure does not.
  const consumed = result.ok || result.usage !== undefined;
  const quota = { used: consumed ? used + 1 : used, limit: FREE_TIER_AI_ASK_LIMIT };

  if (!result.ok) {
    if (result.kind === "upstream_error") console.error("[ai:reel_ask] failed:", result.message);
    const { status, code } = mapAiError(result.kind);
    return bad(code, result.kind === "upstream_error" ? "Jawab nahi mil paaya." : result.message, status, quota);
  }

  return NextResponse.json({ ok: true, answer: result.text.trim(), quota } satisfies ReelAskResponse);
}
