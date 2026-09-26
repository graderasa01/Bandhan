import type { GunaMilan, KundliChart, KundliMilanResponse, MyKundliResponse } from "~/types/api";
import { db } from "./mockDb";
import { MOCK_PEOPLE } from "./people";

/**
 * Demo kundli answers for the mock build — UI states only. The live app never
 * sees any of this: every number there is the server's (`computeGunaMilan`).
 */

const DEMO_MILAN: GunaMilan = {
  total: 26.5,
  max: 36,
  band: "Shubh",
  bandTone: "ok",
  headline: "Guna achhe mile hain — parivaar aam taur par ise shubh maante hain.",
  dosha: [],
  boy: { rashiName: "Mesh", nakshatraName: "Ashwini" },
  girl: { rashiName: "Simha", nakshatraName: "Magha" },
  kootas: [
    { key: "varna", label: "Varna", score: 1, max: 1, boyValue: "Kshatriya", girlValue: "Kshatriya", meaning: "Kaam aur soch ka mel.", verdict: "Dono ek hi varna — poora ank.", tone: "ok" },
    { key: "vashya", label: "Vashya", score: 1, max: 2, boyValue: "Chatushpad", girlValue: "Vanchar", meaning: "Ek doosre par asar aur samajh.", verdict: "Aadha mel.", tone: "info" },
    { key: "tara", label: "Tara", score: 3, max: 3, boyValue: "Ashwini", girlValue: "Magha", meaning: "Sehat aur kismat ka saath.", verdict: "Shubh tara — poora ank.", tone: "ok" },
    { key: "yoni", label: "Yoni", score: 2, max: 4, boyValue: "Ashwa", girlValue: "Mushak", meaning: "Swabhaav aur nazdeeki.", verdict: "Madhyam mel.", tone: "info" },
    { key: "grahaMaitri", label: "Graha Maitri", score: 5, max: 5, boyValue: "Mangal", girlValue: "Surya", meaning: "Rashi swamiyon ki dosti — mann ka mel.", verdict: "Swami mitra hain — poora ank.", tone: "ok" },
    { key: "gana", label: "Gana", score: 6, max: 6, boyValue: "Deva", girlValue: "Rakshasa", meaning: "Mizaaj ka mel.", verdict: "Parampara me yahan poore ank.", tone: "ok" },
    { key: "bhakoot", label: "Bhakoot", score: 7, max: 7, boyValue: "Mesh", girlValue: "Simha", meaning: "Parivaar aur aarthik jeevan.", verdict: "5-9 ka sambandh shubh maana jaata hai.", tone: "ok" },
    { key: "nadi", label: "Nadi", score: 1.5, max: 8, boyValue: "Aadi", girlValue: "Antya", meaning: "Sehat aur santaan — sabse bhaari koot.", verdict: "Alag nadi — dosha nahi.", tone: "info" },
  ],
};

export function mockMilan(profileId: string): KundliMilanResponse {
  const person = MOCK_PEOPLE.find((p) => p.id === profileId);
  if (!person) return { ok: false, message: "Ye profile abhi available nahi hai." };
  const notes = [
    {
      id: "manglik" as const,
      tone: "info" as const,
      title: "Manglik jaankari",
      detail: "Ek taraf manglik status nahi bataya gaya — ghar me baat karke tay karein.",
    },
  ];
  const viewerAssumed = !db.values.birthTime;
  if (!db.values.dateOfBirth) {
    return { ok: true, name: person.name, view: { notes, milan: null, milanBlockedReason: "viewer-missing-dob" }, viewerAssumed, approximate: false };
  }
  if (person.id === "p_pooja") {
    return { ok: true, name: person.name, view: { notes, milan: null, milanBlockedReason: "candidate-missing-dob" }, viewerAssumed, approximate: false };
  }
  return { ok: true, name: person.name, view: { notes, milan: DEMO_MILAN, milanBlockedReason: null }, viewerAssumed, approximate: true };
}

export function mockMyKundli(): MyKundliResponse {
  const dob = db.values.dateOfBirth;
  if (!dob) return { ok: true, chart: null, mangal: null, milanRows: [], pdfEntitled: false, manualUsable: false };
  const hasTime = Boolean(db.values.birthTime);
  const hasPlace = Boolean(db.values.birthPlace);
  const full = hasTime && hasPlace;
  const chart: KundliChart = {
    hasBirthTime: hasTime,
    hasBirthPlace: hasPlace,
    placeName: hasPlace ? (db.values.birthPlace ?? null) : null,
    birthTimeResolved: hasTime ? "06:30" : null,
    dateOfBirth: "1996-02-14",
    assumptions: hasTime ? [] : ["moon-at-noon"],
    lagna: full ? { rashi: 11, rashiName: "Kumbh", degreeInRashi: 12 } : null,
    chandra: { rashi: 1, rashiName: "Mesh", nakshatra: 1, nakshatraName: "Ashwini", pada: 2, nakshatraLord: "Ketu" },
    grahas: [
      ["Surya", 11], ["Chandra", 1], ["Mangal", 9], ["Budh", 10], ["Guru", 9], ["Shukra", 12], ["Shani", 12], ["Rahu", 6], ["Ketu", 12],
    ].map(([graha, rashi], i) => ({
      graha: graha as string,
      longitude: ((rashi as number) - 1) * 30 + 10 + i,
      rashi: rashi as number,
      rashiName: "",
      degreeInRashi: 10 + i,
      nakshatra: 1,
      nakshatraName: "Ashwini",
      pada: 1,
      bhava: full ? (((rashi as number) - 11 + 12) % 12) + 1 : null,
      retrograde: graha === "Rahu" || graha === "Ketu",
    })),
    manglik: { fromLagna: full ? false : null, fromMoon: false, marsHouseFromLagna: full ? 11 : null, marsHouseFromMoon: 9 },
    precision: full ? "full" : hasPlace ? "no-time" : hasTime ? "no-place" : "no-time",
  };
  return {
    ok: true,
    chart,
    mangal: full
      ? { status: "Lagna se manglik shreni me nahi", detail: "Mangal Lagna se gyarahve bhav, Chandra se nauve bhav me; nivaran niyam poori kundli dekh kar hi tay hote hain." }
      : { status: "Chandra se manglik shreni me nahi", detail: "Mangal Chandra se nauve bhav me hai; Lagna ke bina ye aadha jawab hai." },
    milanRows: db.matches.map((m, i) => ({
      profileId: m.profileId,
      name: m.displayName,
      total: i === 0 ? 26.5 : null,
      band: i === 0 ? "Shubh" : null,
      hasDosha: false,
      assumedTime: !hasTime,
      blocked: i === 0 ? null : "missing-data",
    })),
    pdfEntitled: false,
    manualUsable: false,
  };
}
