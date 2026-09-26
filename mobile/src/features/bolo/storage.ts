import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BOLO_DRAFT_KEY,
  acceptAnswers,
  isFillingFor,
  memberDraftKey,
  type BoloDraft,
  type BoloMember,
  type BoloValues,
} from "~/shared/bolo/draft";

/**
 * Where an unfinished Bolo draft waits between launches — the same two keys
 * the web keeps in localStorage (`lib/bolo/draft.ts`): one shared key for a
 * visitor, and one per member so a shared phone never pours one account's
 * answers into another's. Kill the app mid-conversation and the answers are
 * all here next time.
 */

export async function readStoredDraft(key: string): Promise<BoloDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BoloDraft>;
    if (parsed.version !== 1 || typeof parsed.values !== "object" || !parsed.values) return null;
    return {
      version: 1,
      fillingFor: isFillingFor(parsed.fillingFor) ? parsed.fillingFor : null,
      values: parsed.values as BoloValues,
      // A review is confirmed by a person looking at it now, never restored.
      confirmed: false,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export async function writeStoredDraft(key: string, draft: BoloDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage full or unavailable — the draft simply lives in memory this time.
  }
}

export async function removeStoredDraft(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

export function storageKeyFor(member: BoloMember | null): string {
  return member ? memberDraftKey(member.userId) : BOLO_DRAFT_KEY;
}

/**
 * A member's starting draft — `memberStartDraft` in the web's
 * BoloExperience: what the profile already holds, then, only for fields it
 * has nothing for, answers given on this phone before (their own unfinished
 * session here, or a visitor draft from before they signed in). The saved
 * profile always wins a disagreement. A visitor draft is folded in once and
 * removed, so it can never pour into a different account later.
 */
export async function memberStartDraft(member: BoloMember): Promise<BoloDraft> {
  let values: BoloValues = { ...member.values };
  let fillingFor = member.fillingFor;
  for (const stored of [await readStoredDraft(memberDraftKey(member.userId)), await readStoredDraft(BOLO_DRAFT_KEY)]) {
    if (!stored) continue;
    const gaps = Object.fromEntries(Object.entries(stored.values).filter(([key]) => !values[key]));
    values = acceptAnswers(values, gaps).values;
    fillingFor = fillingFor ?? stored.fillingFor;
  }
  await removeStoredDraft(BOLO_DRAFT_KEY);
  return { version: 1, fillingFor, values, confirmed: false, updatedAt: Date.now() };
}
