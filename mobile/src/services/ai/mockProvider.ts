import { FIELD_BY_KEY, PLACES } from "~/catalog";
import { delay } from "~/mocks/mockDb";
import type { AiProvider, ExtractedValue } from "./types";
import { firstNameOf } from "~/utils/names";

/**
 * Offline stand-in for demos and UI work (`EXPO_PUBLIC_DATA_MODE=mock`). It
 * reads a few obvious things with plain pattern matching — enough to walk the
 * speak → review → save flow without a server. It is not the product's AI and
 * never pretends to be: every value still goes through the same review card.
 */

const CITIES = PLACES.flatMap((p) => p.cities);

function pickOption(key: string, text: string): string | null {
  const options = FIELD_BY_KEY[key]?.options ?? [];
  const lower = text.toLowerCase();
  return options.find((o) => lower.includes(o.toLowerCase())) ?? null;
}

function span(text: string, needle: string): string {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  return i < 0 ? needle : text.slice(Math.max(0, i - 12), i + needle.length + 12).trim();
}

export const mockProvider: AiProvider = {
  id: "offline-demo",

  async voiceAvailable() {
    return false;
  },

  async transcribe() {
    await delay(600);
    return "Mera naam Aarav hai, main ladka hoon, 5 foot 10 inch, Jaipur me rehta hoon, B.Tech kiya hai aur Software Engineer hoon, veg khata hoon.";
  },

  async extractProfile({ transcript }) {
    await delay(800);
    const t = transcript;
    const lower = t.toLowerCase();
    const out: ExtractedValue[] = [];
    const add = (key: string, value: string | null, needle?: string, confidence = 0.86) => {
      if (value) out.push({ key, value, confidence, sourceSpan: needle ? span(t, needle) : null, inferred: false });
    };

    const name = t.match(/(?:naam|name)\s+(?:hai\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (name) add("fullName", name[1]!, name[1]!, 0.9);
    if (/\b(ladki|beti|female)\b/.test(lower)) add("gender", "Ladki", "ladki");
    else if (/\b(ladka|beta|male)\b/.test(lower)) add("gender", "Ladka", "ladka");

    const height = lower.match(/(\d)\s*(?:foot|feet|ft|')\s*(\d{1,2})?/);
    if (height) add("height", `${height[1]}'${height[2] ?? "0"}"`, height[0]);

    const city = CITIES.find((c) => lower.includes(c.toLowerCase()));
    if (city) add("currentCity", city, city);

    add("education", pickOption("education", t), pickOption("education", t) ?? undefined);
    add("diet", /\bnon[- ]?veg\b/.test(lower) ? "Non-veg" : /\bveg\b/.test(lower) ? "Veg" : null, "veg", 0.8);
    add("maritalStatus", /unmarried|never married|shaadi nahi/.test(lower) ? "Never Married" : null, "unmarried", 0.8);
    add("familyType", /joint/.test(lower) ? "Joint family" : /nuclear/.test(lower) ? "Nuclear family" : null, "family", 0.75);

    const job = t.match(/(Software Engineer|Doctor|Teacher|Engineer|Business|Lawyer|Designer|Manager|CA)/i);
    if (job) add("profession", job[1]!, job[1]!, 0.8);

    return { values: out, unresolved: [], clarification: out.length === 0 ? "Thoda aur detail me bataiye — naam, sheher, padhai ya kaam." : null, declined: false };
  },

  async readBiodata() {
    await delay(1400);
    return {
      values: [
        { key: "fullName", value: "Aarav Sharma", confidence: 0.95, sourceSpan: "Naam: Aarav Sharma", inferred: false },
        { key: "dateOfBirth", value: "14/02/1996", confidence: 0.9, sourceSpan: "Janm tithi: 14-02-1996", inferred: false },
        { key: "height", value: `5'10"`, confidence: 0.88, sourceSpan: "Kad: 5 ft 10 in", inferred: false },
        { key: "education", value: "B.Tech", confidence: 0.86, sourceSpan: "Shiksha: B.Tech (CSE)", inferred: false },
        { key: "familyType", value: "Joint family", confidence: 0.7, sourceSpan: "Sanyukt parivar", inferred: false },
        { key: "currentCity", value: "Jaipur", confidence: 0.6, sourceSpan: "Pata: Malviya Nagar, Jaipur", inferred: true },
      ],
      unresolved: [],
      clarification: null,
      declined: false,
      looksLikeBiodata: true,
    };
  },

  async writeBio({ known, fillingFor }) {
    await delay(900);
    const name = firstNameOf(known.fullName) || (fillingFor === "self" ? "Main" : "Wo");
    const city = known.currentCity ? ` ${known.currentCity} se` : "";
    const work = known.profession ? ` ${known.profession} hain` : "";
    return [
      { tone: "simple", text: `${name}${city}${work}. Seedhe, samajhdar aur parivaar se jude hue — ek aise saathi ki talaash hai jo izzat aur samajh ko sabse upar rakhe.` },
      { tone: "family", text: `${name} ek sanskari aur milansaar parivaar se hain. Ghar ke logon ke saath waqt bitana aur tyohar manana unhe bahut pasand hai.` },
      { tone: "professional", text: `${name}${work ? ` ek motivated professional hain jo${city ? city.replace(" se", " me") : ""} kaam karte hain` : " apne kaam ko lekar serious hain"} aur zindagi me balance ko ahmiyat dete hain.` },
    ];
  },
};
