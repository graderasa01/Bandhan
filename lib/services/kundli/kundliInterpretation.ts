import "server-only";
import { callAi } from "@/lib/ai/providers";
import type { GunaMilan, KootaResult, KundliChart, KundliInterpretation } from "@/lib/contracts/kundli";
import { noopT, type Translate } from "@/lib/i18n/translate";
import { BHAVA_MEANING } from "./tables";

/**
 * Astro-AI — a traditional *reading* of a chart that code has already built.
 *
 * ## The boundary
 *
 * The model never computes. It receives a summary of the `KundliChart` (and,
 * for a pair, the `GunaMilan`) exactly as `chart.ts` and `gunaMilan.ts`
 * produced them, and writes prose about those numbers. It may not add a
 * planet, a house, a nakshatra or a guna that is not in the summary; it may
 * not "correct" a value; and it may not say what will happen. The prompt says
 * so, the JSON schema bounds the shape, and `sanitize()` below drops any
 * sentence that still makes a claim this feature must never make.
 *
 * ## What it is for
 *
 * A family that has just seen "Chandra Kark, Pushya nakshatra, Mangal 7th
 * bhav se" wants the sentence a pandit would say next: what the tradition
 * reads into that, what it counts as a strength, what it would sit down and
 * talk about. That sentence is guidance in the tradition's own terms, and
 * every reading ends with the same fixed note saying exactly that.
 *
 * ## What happens without it
 *
 * Nothing breaks. The deterministic chart, the koota table with its own
 * meaning/verdict lines, and the PDF are all complete on their own; a
 * missing key, a refusal or an upstream failure resolve to `null` and the
 * screen simply has no Astro-AI section. It never blocks a chart and it
 * never reaches `pipeline.ts` — a reading is shown, never ranked on.
 */

const SYSTEM_PROMPT = `Tum ek anubhavi, sanyamit Vedic jyotish salahkar ho jo BandhanTak (ek Indian matrimony app) ke liye ek pehle se COMPUTED kundli ki paramparik vyakhya likhte ho. Hinglish me likho (Hindi shabd, Latin script), "aap" ke saath, garmjoshi aur saaf.

Sakht niyam:
1. Tum kuch bhi GANIT nahi karte. Sirf jo chart summary di gayi hai usi par likho. Koi naya graha, bhava, nakshatra, rashi, guna ya ank mat jodo, koi value mat badlo. Jo summary me nahi hai, wo tumhare liye maujood nahi hai.
2. Bhavishyavani nahi. "Shaadi zaroor hogi", "pakka", "guarantee", "kabhi nahi hoga" jaisi baatein bilkul nahi. Har baat "parampara ke hisaab se", "jyotish me maana jaata hai" jaise shabdon ke saath.
3. Sehat, bimari, santaan/fertility, umar/mrityu, dhan ki guarantee — in vishayon par KUCH mat kaho, ishara bhi nahi.
4. Jyotish ko vigyan ya nishchit satya mat batao. Ye paramparik margdarshan hai — yahi tumhara sur hai.
5. Agar chart me lagna nahi hai (precision "no-time" ya "no-place"), to lagna ya bhava par aadharit koi baat mat karo — sirf Chandra rashi/nakshatra aur graha-rashi par likho, aur ye batao ki lagna ke bina vyakhya adhoori hai.
6. Manglik: sirf summary me diye gaye computed flags par, aur hamesha "nivaran/bhang ke niyam poori kundli dekhe bina tay nahi hote" jodo.
7. Guna milan mila ho to har koota ke liye ek saral line — us koota ka arth aur ye score kya kehta hai — bina kisi faisle ke.
8. Chhota rakho: summary 2-3 vaakya; har list me 2-4 chhoti lines (ek line = ek vaakya, 25 shabd tak).`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    temperament: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    discuss: { type: "array", items: { type: "string" } },
    gunaNotes: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, note: { type: "string" } },
        required: ["key", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "temperament", "strengths", "discuss", "gunaNotes"],
  additionalProperties: false,
} as const;

/**
 * The summary the model reads — every number from the chart, nothing else.
 * Bhava meanings ride along so the model does not have to remember (or
 * invent) what the seventh house is about.
 */
export function chartSummaryForAi(chart: KundliChart, milan: GunaMilan | null): Record<string, unknown> {
  return {
    precision: chart.precision,
    assumptions: chart.assumptions,
    chandra: chart.chandra,
    lagna: chart.lagna,
    grahas: chart.grahas.map((g) => ({
      graha: g.graha,
      rashi: g.rashiName,
      nakshatra: g.nakshatraName,
      pada: g.pada,
      bhava: g.bhava === null ? null : `${g.bhava} (${BHAVA_MEANING[g.bhava - 1]})`,
      retrograde: g.retrograde,
    })),
    manglik: chart.manglik,
    gunaMilan: milan
      ? {
          total: milan.total,
          max: milan.max,
          band: milan.band,
          kootas: milan.kootas.map((k) => ({ key: k.key, label: k.label, score: k.score, max: k.max, boy: k.boyValue, girl: k.girlValue })),
          dosha: milan.dosha.map((d) => d.key),
        }
      : null,
  };
}

/**
 * Claims the feature must never make, whatever the model wrote. A sentence
 * carrying any of these is dropped whole rather than softened — an edited
 * prediction is still a prediction.
 */
const FORBIDDEN = [
  /\bguarantee\b/i,
  /\bpakka\b/i,
  /\bzaroor (hogi|hoga|honge|hongi)\b/i,
  /\bkabhi nahi (hogi|hoga|honge)\b/i,
  /\b(bimari|beemari|illness|disease|cancer|rog)\b/i,
  /\b(santaan|santan|fertility|baanjh|banjh|pregnan|garbh)\b/i,
  /\b(mrityu|maut|death|die|mar jaa)\b/i,
  /\b(scientific(ally)? proven|vigyan siddh)\b/i,
];

function cleanLine(raw: unknown, max = 240): string | null {
  if (typeof raw !== "string") return null;
  const line = raw.replace(/\s+/g, " ").trim();
  if (!line) return null;
  if (FORBIDDEN.some((re) => re.test(line))) return null;
  return line.slice(0, max);
}

/**
 * Test seam: the claim filter, without a model call. `scripts/kundli-check.ts`
 * pins the sentences this feature must drop whole.
 */
export { cleanLine as sanitizeInterpretationLine };

function cleanList(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l) => cleanLine(l)).filter((l): l is string => l !== null).slice(0, limit);
}

const KOOTA_KEYS: ReadonlySet<string> = new Set(["varna", "vashya", "tara", "yoni", "grahaMaitri", "gana", "bhakoot", "nadi"]);

/**
 * One reading for a chart, or for a chart plus its milan against one
 * candidate. `null` whenever the model is unavailable or unusable — callers
 * render the deterministic chart exactly as they would have anyway.
 */
export async function interpretKundli(
  params: { userId: string; chart: KundliChart; milan?: GunaMilan | null; logFeature?: string },
  t: Translate = noopT,
): Promise<KundliInterpretation | null> {
  const milan = params.milan ?? null;
  const result = await callAi({
    configFeature: "kundliInterpretation",
    logFeature: params.logFeature ?? "kundli_interpretation",
    userId: params.userId,
    system: SYSTEM_PROMPT,
    content: JSON.stringify(chartSummaryForAi(params.chart, milan)),
    // A schema-shaped answer of a few short lists — sized for the answer, so
    // reasoning must not draw on it (see `AiCallParams.thinking`).
    maxTokens: 1200,
    thinking: "off",
    jsonSchema: SCHEMA as unknown as Record<string, unknown>,
    schemaName: "kundli_interpretation",
  });
  if (!result.ok) {
    if (result.kind === "upstream_error") console.error("[ai:kundli_interpretation] failed:", result.message);
    return null;
  }

  let parsed: { summary?: unknown; temperament?: unknown; strengths?: unknown; discuss?: unknown; gunaNotes?: unknown };
  try {
    parsed = JSON.parse(result.text) as typeof parsed;
  } catch {
    console.error("[ai:kundli_interpretation] response was not valid JSON:", result.text.slice(0, 200));
    return null;
  }

  const summary = cleanLine(parsed.summary, 600);
  if (!summary) return null;

  // Guna notes only for kootas the milan actually has — a note about a
  // koota that was not scored is exactly the invention rule 1 forbids.
  const byKey = new Map<string, KootaResult>((milan?.kootas ?? []).map((k) => [k.key, k]));
  const gunaNotes: KundliInterpretation["gunaNotes"] = [];
  if (Array.isArray(parsed.gunaNotes) && milan) {
    for (const raw of parsed.gunaNotes as Array<{ key?: unknown; note?: unknown }>) {
      const key = typeof raw?.key === "string" ? raw.key : "";
      const koota = KOOTA_KEYS.has(key) ? byKey.get(key) : undefined;
      const note = cleanLine(raw?.note);
      if (!koota || !note || gunaNotes.some((n) => n.key === koota.key)) continue;
      gunaNotes.push({ key: koota.key, label: koota.label, note });
    }
  }

  return {
    summary,
    temperament: cleanList(parsed.temperament, 4),
    strengths: cleanList(parsed.strengths, 4),
    discuss: cleanList(parsed.discuss, 4),
    gunaNotes,
    note: t(
      "kundli.interpretation.note",
      "Ye paramparik jyotish ke hisaab se margdarshan hai — nishchit satya nahi, aur BandhanTak ki matching par iska koi asar nahi. Faisle ke liye poori kundli pandit ji ko dikhaiye.",
    ),
    provider: `${result.route.provider.toLowerCase()} · ${result.route.model}`,
  };
}
