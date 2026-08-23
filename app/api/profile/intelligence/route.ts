import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import {
  getIntelligenceState,
  saveSignalAnswer,
  type IntelligenceState,
  type SignalAnswerValue,
} from "@/lib/services/profile/intelligenceService";

export const runtime = "nodejs";

/**
 * Marriage Intelligence — progress and answers for the signed-in user only.
 *
 * There is deliberately no `?userId=` on this route. Every answer here belongs
 * to one of three buckets and two of them are never readable by anyone else
 * (see `SignalVisibility`), so "whose answers?" has exactly one safe answer:
 * the caller's own. A viewer-facing read would need its own endpoint with its
 * own visibility filter, which is `profileVisibleAnswers` on the profile page.
 */
function serialize(state: IntelligenceState) {
  return {
    progress: state.progress,
    respondentType: state.respondentType,
    answers: Object.fromEntries(
      [...state.answers].map(([key, view]) => [
        key,
        { value: view.value, confirmed: view.confirmed, derived: view.derived },
      ]),
    ),
  };
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  return NextResponse.json(serialize(await getIntelligenceState(user.id)));
}

function parseValue(raw: unknown): SignalAnswerValue | null {
  if (typeof raw === "string" && raw.trim()) return raw;
  if (Array.isArray(raw)) {
    const items = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    if (items.length > 0) return items;
  }
  return null;
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: { key?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key : null;
  const value = parseValue(body.value);
  if (!key || value === null) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: "key aur value dono chahiye." },
      { status: 422 },
    );
  }

  const result = await saveSignalAnswer(user.id, key, value);
  if (!result.ok) {
    const message =
      result.error === "UNKNOWN_KEY"
        ? "Ye sawaal maujood nahi hai."
        : result.error === "TOO_MANY"
          ? "Isse zyada options nahi chun sakte."
          : "Ye jawab is sawaal ke options me nahi hai.";
    return NextResponse.json({ error: result.error, message }, { status: 422 });
  }

  return NextResponse.json(serialize(result.state));
}
