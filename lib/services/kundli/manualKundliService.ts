import "server-only";
import { z } from "zod";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { consumeReward } from "@/lib/services/rewards/rewardService";
import { buildChart, parseBirthTime } from "./chart";
import { placeFromCandidate, resolveBirthPlace } from "./geocoding";
import { interpretKundli } from "./kundliInterpretation";
import type { Place } from "./places";
import type { KundliChart, KundliInterpretation, KundliSubject, PlaceCandidate } from "@/lib/contracts/kundli";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * The paid shortcut: type someone's birth details right now, get a chart back
 * — without first answering the profile builder's stage-3 birth questions.
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
 * ## What a full kundli needs, and what happens without it
 *
 * Name (for the result and the PDF — it changes no number), date, the exact
 * time, and the place. Time and place are required *unless the person says
 * they do not have them* — `birthTimeUnknown` / `placeUnknown` are explicit
 * choices on the form, never a default. Without a time the result is a
 * Moon-based chart with no lagna, no bhava, no full Manglik verdict, and the
 * chart says so (`precision`, `assumptions`). A place that cannot be found
 * is reported back as a place to correct, or a list to choose from — never
 * swapped for a default city.
 *
 * The plan gate mirrors `unlockVoiceNote` exactly: the plan says yes
 * (`kundliManualEntry`), or the user spends a KUNDLI_UNLOCK credit they
 * earned. The credit is spent only once the chart is actually built — a typo
 * in the city must not cost an unlock.
 */

const PlaceChoice = z.object({
  id: z.string().max(80),
  name: z.string().trim().min(1).max(120),
  region: z.string().trim().max(160),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timeZoneId: z.string().max(64).nullable(),
});

export const ManualKundliInput = z.object({
  name: z.string().trim().min(2, "Naam daaliye.").max(80),
  dateOfBirth: z.string().refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)), "Valid date daaliye."),
  birthTime: z.string().trim().max(40).optional(),
  birthTimeUnknown: z.boolean().optional(),
  birthPlace: z.string().trim().max(120).optional(),
  placeUnknown: z.boolean().optional(),
  /** The person's pick from a `PLACE_AMBIGUOUS` answer — used verbatim. */
  placeChoice: PlaceChoice.optional(),
  /** Default true. False skips the Astro-AI call (a re-run for the PDF, a script). */
  interpret: z.boolean().optional(),
});

export type ManualKundliInputData = z.infer<typeof ManualKundliInput>;

/** Everything that can go wrong before a chart exists — each one a question the form can ask. */
export type ManualChartProblem =
  | { ok: false; code: "INVALID"; message: string; field?: "name" | "dateOfBirth" | "birthTime" | "birthPlace" }
  | { ok: false; code: "PLACE_AMBIGUOUS"; message: string; candidates: PlaceCandidate[] }
  | { ok: false; code: "PLACE_UNRESOLVED"; message: string; reason: "no-match" | "no-provider" | "provider-error" };

export type ManualChartOutcome = { ok: true; chart: KundliChart; subject: KundliSubject } | ManualChartProblem;

export type ManualKundliResult =
  | {
      ok: true;
      chart: KundliChart;
      subject: KundliSubject;
      /** Null when the model is unavailable — the chart stands on its own. */
      interpretation: KundliInterpretation | null;
      usedCredit: boolean;
    }
  | ManualChartProblem
  | { ok: false; code: "LOCKED"; message: string };

/**
 * Typed details → a chart, with no gate and no side effects of any kind.
 *
 * Split out from `generateManualKundli` so the PDF route can re-render the
 * same chart from the same inputs without spending a second unlock — the
 * whole computation is deterministic, so re-running it is the honest way to
 * "fetch" a result that was never stored.
 */
export async function computeManualChart(input: ManualKundliInputData, t: Translate = noopT): Promise<ManualChartOutcome> {
  const dob = new Date(`${input.dateOfBirth}T00:00:00Z`);
  const now = new Date();
  if (dob > now || dob.getUTCFullYear() < 1900) {
    return { ok: false, code: "INVALID", field: "dateOfBirth", message: t("kundli.manual.error.invalidDob", "Date of Birth sahi nahi lag rahi.") };
  }

  // Time: given and readable, or explicitly unknown. A blank is neither.
  const timeUnknown = input.birthTimeUnknown === true;
  const birthTime = timeUnknown ? null : (input.birthTime ?? "").trim() || null;
  if (!timeUnknown) {
    if (!birthTime) {
      return {
        ok: false,
        code: "INVALID",
        field: "birthTime",
        message: t("kundli.manual.error.timeRequired", "Poori kundli ke liye janm samay chahiye — pata na ho to \"Janm samay pata nahi\" chunein."),
      };
    }
    if (parseBirthTime(birthTime) === null) {
      return {
        ok: false,
        code: "INVALID",
        field: "birthTime",
        message: t("kundli.manual.error.timeUnreadable", "Janm samay samajh nahi aaya — jaise \"subah 6:30\" ya \"18:45\" likhein."),
      };
    }
  }

  // Place: given, picked from the ambiguous list, or explicitly unknown.
  const placeUnknown = input.placeUnknown === true;
  const birthPlace = placeUnknown ? null : (input.birthPlace ?? "").trim() || null;
  if (!placeUnknown && !birthPlace && !input.placeChoice) {
    return {
      ok: false,
      code: "INVALID",
      field: "birthPlace",
      message: t("kundli.manual.error.placeRequired", "Janm sthaan likhein — pata na ho to \"Sthaan pata nahi\" chunein."),
    };
  }

  const birth = { year: dob.getUTCFullYear(), month1: dob.getUTCMonth() + 1, day: dob.getUTCDate() };
  let place: Place | null = null;
  if (input.placeChoice) {
    place = placeFromCandidate(input.placeChoice, birth);
  } else if (birthPlace) {
    const resolution = await resolveBirthPlace(birthPlace, birth);
    if (resolution.status === "ambiguous") {
      return {
        ok: false,
        code: "PLACE_AMBIGUOUS",
        message: t("kundli.manual.error.placeAmbiguous", "Is naam ki ek se zyada jagah mili — kaunsi?"),
        candidates: resolution.candidates,
      };
    }
    if (resolution.status === "unresolved") {
      // Never a default city. The person corrects the spelling, adds the
      // state, or says the place is unknown and gets the Moon-only chart.
      return {
        ok: false,
        code: "PLACE_UNRESOLVED",
        reason: resolution.reason === "empty" ? "no-match" : resolution.reason,
        message:
          resolution.reason === "provider-error"
            ? t("kundli.manual.error.placeLookupDown", "Sthaan abhi dhoondha nahi ja saka — thodi der baad try karein, ya bade sheher ka naam likhein.")
            : t(
                "kundli.manual.error.placeUnresolved",
                "Ye sthaan pehchana nahi gaya. Spelling check karein ya paas ka bada sheher likhein — ya \"Sthaan pata nahi\" chunein (tab lagna nahi banega).",
              ),
      };
    }
    place = resolution.place;
  }

  const chart = buildChart({ dateOfBirth: dob, birthTime, place });

  // Cannot actually happen — dateOfBirth was just validated above — but
  // buildChart's contract is "null when no DOB", so the type is still
  // nullable and a real (if unreachable) branch is more honest than a `!`.
  if (!chart) {
    return { ok: false, code: "INVALID", message: t("kundli.manual.error.buildFailed", "Kundli nahi ban paayi. Date dobara check karein.") };
  }

  const subject: KundliSubject = {
    name: input.name.trim(),
    dateOfBirth: input.dateOfBirth,
    birthTime,
    birthTimeUnknown: timeUnknown,
    birthPlace: input.placeChoice ? place?.name ?? null : birthPlace,
    birthPlaceUnknown: placeUnknown,
  };

  return { ok: true, chart, subject };
}

export async function generateManualKundli(
  userId: string,
  input: ManualKundliInputData,
  t: Translate = noopT,
): Promise<ManualKundliResult> {
  const ctx = await getPlanContext(userId);
  const entitled = ctx.features.kundliManualEntry;
  const locked = {
    ok: false as const,
    code: "LOCKED" as const,
    message: t(
      "kundli.manual.error.locked",
      "Turant kundli banane ke liye plan upgrade karein, ya mission poora karke ek unlock jeetein.",
    ),
  };
  if (!entitled && ctx.credits.KUNDLI_UNLOCK <= 0) return locked;

  const outcome = await computeManualChart(input, t);
  if (!outcome.ok) return outcome;

  // Only now — the chart exists — does a credit get spent.
  let usedCredit = false;
  if (!entitled) {
    const spent = await consumeReward(userId, "KUNDLI_UNLOCK", 1);
    if (!spent) return locked;
    usedCredit = true;
  }

  // Best-effort and last: the chart is already complete without it.
  const interpretation =
    input.interpret === false
      ? null
      : await interpretKundli({ userId, chart: outcome.chart, logFeature: "kundli_interpretation_manual" }, t).catch(() => null);

  return { ok: true, chart: outcome.chart, subject: outcome.subject, interpretation, usedCredit };
}
