import "server-only";
import { z } from "zod";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { consumeReward } from "@/lib/services/rewards/rewardService";
import { buildChart } from "./chart";
import type { KundliChart } from "@/lib/contracts/kundli";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * The paid shortcut: type a date of birth right now, get a chart back —
 * without first answering the profile builder's stage-3 birth questions.
 *
 * This is deliberately a *pure* computation, not a write. `buildChart()` is
 * called on whatever the caller typed and the result is handed straight back;
 * nothing here ever touches `Profile`/`ProfileBasicDetails`. Two reasons:
 *
 *  1. Those columns carry a promise made at the moment the user answers them
 *     in the real interview ("sirf kundli ke liye — kisi aur ko kabhi nahi
 *     dikhta", `lib/profile/fields.ts`). A quick-tool submission is a
 *     different consent than that — silently overwriting the profile's own
 *     birth fields from a throwaway form would be surprising at best.
 *  2. The tool is not restricted to "your own" birth details — a user typing
 *     a date they know for a parent or a shortlisted match with no birth data
 *     on file is a normal use, same as any public kundli calculator. Writing
 *     that into *this* user's own profile would be simply wrong.
 *
 * The plan gate mirrors `unlockVoiceNote` exactly: the plan says yes
 * (`kundliManualEntry`), or the user spends a KUNDLI_UNLOCK credit they
 * earned. See lib/constants/plans.ts for why the tier line sits where it does.
 */

export const ManualKundliInput = z.object({
  dateOfBirth: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Valid date daaliye."),
  birthTime: z.string().trim().max(40).optional(),
  birthPlace: z.string().trim().max(80).optional(),
});

export type ManualKundliResult =
  | { ok: true; chart: KundliChart; usedCredit: boolean }
  | { ok: false; code: "LOCKED" | "INVALID"; message: string };

export async function generateManualKundli(
  userId: string,
  input: z.infer<typeof ManualKundliInput>,
  t: Translate = noopT,
): Promise<ManualKundliResult> {
  const dob = new Date(input.dateOfBirth);
  const now = new Date();
  if (dob > now || dob.getUTCFullYear() < 1900) {
    return { ok: false, code: "INVALID", message: t("kundli.manual.error.invalidDob", "Date of Birth sahi nahi lag rahi.") };
  }

  const ctx = await getPlanContext(userId);
  let usedCredit = false;

  if (!ctx.features.kundliManualEntry) {
    const spent = await consumeReward(userId, "KUNDLI_UNLOCK", 1);
    if (!spent) {
      return {
        ok: false,
        code: "LOCKED",
        message: t(
          "kundli.manual.error.locked",
          "Turant kundli banane ke liye plan upgrade karein, ya mission poora karke ek unlock jeetein.",
        ),
      };
    }
    usedCredit = true;
  }

  const chart = buildChart({
    dateOfBirth: dob,
    birthTime: input.birthTime,
    birthPlace: input.birthPlace,
  });

  // Cannot actually happen — dateOfBirth was just validated above — but
  // buildChart's contract is "null when no DOB", so the type is still
  // nullable and a real (if unreachable) branch is more honest than a `!`.
  if (!chart) {
    return { ok: false, code: "INVALID", message: t("kundli.manual.error.buildFailed", "Kundli nahi ban paayi. Date dobara check karein.") };
  }

  return { ok: true, chart, usedCredit };
}
