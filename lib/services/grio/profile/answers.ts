import type {
  GrioAnswerStyle,
  GrioEvidenceRow,
  GrioIntent,
  GrioProfileAction,
  GrioPromptSuggestion,
} from "@/lib/contracts/grioProfile";
import type { KundliMatchView } from "@/lib/contracts/kundli";
import type { ProfileVisibilityLevel } from "@/lib/services/profile/visibility";
import type { ProfileEvidence, SelectedEvidence } from "./evidence";
import { LEVEL_UNLOCK, SECTION_TITLE, type ProfileSectionId, type ProfileSections } from "./sections";

/**
 * The answers code can give on its own, and the words it falls back on when a
 * model cannot be reached.
 *
 * Three questions never need a model: "kundli available hai?" is a lookup,
 * "kya missing hai?" is a diff against the field list, and "is profile ke liye
 * kya useful hai?" is a check of which doors are actually open. Answering them
 * in code is faster, free, and — the reason that matters — cannot invent
 * anything.
 *
 * The fallbacks exist for the other questions. When every model is down, the
 * member still asked a real question about a real person, and "Grio couldn't
 * answer" throws away facts the server already has in hand. So they get those
 * facts, plainly, with one honest line saying the fuller answer is not
 * available right now.
 *
 * Every string here is code's. Pure — no prisma, no AI.
 */

export interface ProfileRelationship {
  interestSent: boolean;
  interestReceived: boolean;
  matchId: string | null;
  chatOpen: boolean;
  shortlisted: boolean;
  /** Ask Bridge: whether this viewer has already used their one question on this person. */
  askedStatus: string;
  askBridgeEnabled: boolean;
  hasVoiceNote: boolean;
}

export interface ProfileTurnFacts {
  profileId: string;
  name: string;
  level: ProfileVisibilityLevel;
  sections: ProfileSections;
  evidence: ProfileEvidence;
  /** Null when this turn did not load it (only kundli/services/summary questions do). */
  kundli: KundliMatchView | null;
  relationship: ProfileRelationship;
}

const bullet = (s: string) => `• ${s}`;

function cap<T>(items: T[], style: GrioAnswerStyle, fallback: number): T[] {
  return items.slice(0, style.maxPoints ?? fallback);
}

/* ------------------------------------------------------------------ */
/* Answers code gives outright                                          */
/* ------------------------------------------------------------------ */

export function answerMissingInfo(f: ProfileTurnFacts, style: GrioAnswerStyle): string {
  const order: ProfileSectionId[] = ["family", "lifestyle", "career", "education", "values", "basics", "expectations", "about"];
  const missingLines = order
    .map((id) => f.sections.sections[id])
    .filter((s) => s.missing.length > 0)
    .map((s) =>
      // "Apne baare me: apne baare me likha hua" reads as a stutter — the
      // about section is one field, so it gets one plain sentence.
      s.id === "about" ? bullet("Apne baare me unhone abhi kuch nahi likha") : bullet(`${s.title}: ${s.missing.join(", ")}`),
    );

  const lockedL2 = order.flatMap((id) => f.sections.sections[id].locked.filter((l) => l.level === "L2").flatMap((l) => l.labels));
  const lockedL3 = (Object.keys(f.sections.sections) as ProfileSectionId[]).flatMap((id) =>
    f.sections.sections[id].locked.filter((l) => l.level === "L3").flatMap((l) => l.labels),
  );

  const parts: string[] = [];
  if (missingLines.length > 0) {
    parts.push(`${f.name} ki profile me abhi ye baatein nahi di gayi hain:\n${cap(missingLines, style, 6).join("\n")}`);
  } else {
    parts.push(`Aapko jo hissa abhi dikh sakta hai, ${f.name} ki profile me wo sab bhara hua hai.`);
  }
  if (lockedL2.length > 0) {
    parts.push(`Ye ${LEVEL_UNLOCK.L2} dikhega: ${lockedL2.slice(0, 6).join(", ")}${lockedL2.length > 6 ? " aur kuch aur" : ""}.`);
  }
  if (lockedL3.length > 0) {
    parts.push(`Aur ${LEVEL_UNLOCK.L3}: ${lockedL3.join(", ")}.`);
  }
  if (missingLines.length > 0) {
    parts.push("Jo nahi diya gaya, wo na achha hai na bura — bas pata nahi hai. Chahein to baat-cheet me poochh sakte hain.");
  }
  return parts.join("\n\n");
}

export function answerKundli(f: ProfileTurnFacts): string {
  const k = f.kundli;
  if (!k) return `${f.name} ki kundli jaankari abhi load nahi ho payi — thodi der baad dobara poochiye.`;
  const lines: string[] = [];
  if (k.milan) {
    const dosha = k.milan.dosha.map((d) => d.title).join(", ");
    lines.push(`Haan — ${f.name} ke saath guna milan bana hai: 36 me se ${k.milan.total} guna (${k.milan.band}).`);
    if (dosha) lines.push(`Dosh: ${dosha}.`);
  } else if (k.milanBlockedReason === "viewer-missing-dob") {
    lines.push("Guna milan abhi nahi ban sakta — aapki apni janm tithi profile me nahi hai. Wo bharte hi milan ban jayega.");
  } else if (k.milanBlockedReason === "candidate-missing-dob") {
    lines.push(`${f.name} ki profile me janm tithi nahi di gayi, isliye guna milan nahi ban sakta.`);
  } else if (k.milanBlockedReason === "same-gender") {
    lines.push("Is jodi ke liye paramparik guna milan nahi banta.");
  }
  for (const n of k.notes.slice(0, 2)) lines.push(`${n.title} — ${n.detail}`);
  lines.push("Ye parampara ka ek nazariya hai — BandhanTak ki matching isse tay nahi hoti, aur faisla aapka hi hai.");
  return lines.join("\n");
}

export function kundliAvailable(f: ProfileTurnFacts): boolean {
  return Boolean(f.kundli?.milan) || (f.kundli?.notes.length ?? 0) > 0;
}

export function answerServices(f: ProfileTurnFacts): string {
  const r = f.relationship;
  const lines: string[] = [];
  if (f.kundli?.milan) lines.push(bullet(`Kundli milan — 36 me se ${f.kundli.milan.total} guna ka poora hisaab.`));
  if (f.sections.sections.family.facts.length > 0) lines.push(bullet("Family details — jo parivaar ke baare me profile me diya hai."));
  if (f.evidence.rows.some((row) => row.status === "match")) lines.push(bullet("Compare — aap dono me kya milta hai aur kya alag hai."));
  if (r.matchId && r.chatOpen) lines.push(bullet("Message — chat khuli hai, seedha baat kar sakte hain."));
  else if (!r.matchId && r.askBridgeEnabled && r.askedStatus === "NONE") {
    lines.push(bullet("Ek sawaal poochhna — jawab unki awaaz me aata hai (ek insaan se ek hi sawaal)."));
  }
  if (!r.matchId && !r.interestSent) lines.push(bullet("Interest — bhejne par family aur background ki aur jaankari khulti hai."));
  if (r.hasVoiceNote) lines.push(bullet("Parivaar ka voice blessing — profile par sunne ke liye maujood hai."));
  if (lines.length === 0) {
    return `${f.name} ke liye abhi yahan se profile ki details dekhna aur Grio se sawaal poochhna hi sabse kaam ka hai.`;
  }
  return `${f.name} ke liye yahan se ye kaam ke hain:\n${lines.slice(0, 5).join("\n")}`;
}

/* ------------------------------------------------------------------ */
/* Fallback prose — when a model was asked and could not answer         */
/* ------------------------------------------------------------------ */

/**
 * One comparison as a plain sentence — the same facts as the evidence card, in
 * the words a person would use, because this text is what a member reads when
 * no model is there to phrase it.
 */
function evidenceLine(r: GrioEvidenceRow): string {
  const want = r.yours?.replace(/^Aapki pasand:\s*/, "") ?? null;
  const mine = r.yours?.replace(/^Aap:\s*/, "") ?? null;
  if (r.kind === "values") return `${r.label}: ${r.note ?? "jaankari kam hai"}`;
  if (r.kind === "common") {
    if (r.status === "match") return r.note ? `${r.label} — ${r.note.replace(/\.$/, "")}` : `${r.label}: aap dono ${r.theirs ?? ""}`.trim();
    if (r.theirs && mine) return `${r.label}: aap ${mine}, ye ${r.theirs}`;
    return `${r.label}: ${r.note ?? "jaankari kam hai"}`;
  }
  if (r.status === "locked") return `${r.label}: aapki pasand ${want ?? ""} — inki taraf ki jaankari abhi khuli nahi`.replace(/\s+—/, " —");
  if (!r.theirs) return `${r.label}: aapki pasand ${want ?? ""} — profile me ye nahi diya`.replace(/\s+—/, " —");
  return `${r.label}: aapki pasand ${want ?? ""}, inka ${r.theirs}`;
}

function sectionBullets(f: ProfileTurnFacts, id: ProfileSectionId, style: GrioAnswerStyle): string {
  const s = f.sections.sections[id];
  if (s.facts.length === 0) {
    const locked = s.locked.map((l) => `${LEVEL_UNLOCK[l.level]}: ${l.labels.join(", ")}`).join("; ");
    return `${SECTION_TITLE[id]} ki details is profile me abhi available nahi hain.${locked ? ` (${locked} dikhega.)` : ""}`;
  }
  const lines = cap(
    s.facts.map((fact) => bullet(`${fact.label}: ${fact.value}`)),
    style,
    style.detailed ? 10 : 6,
  );
  const extra: string[] = [];
  if (s.missing.length > 0) extra.push(`Profile me nahi diya gaya: ${s.missing.join(", ")}.`);
  for (const l of s.locked) extra.push(`${LEVEL_UNLOCK[l.level]} dikhega: ${l.labels.join(", ")}.`);
  return `Profile me ${SECTION_TITLE[id].toLowerCase()} ke baare me ye diya hai:\n${lines.join("\n")}${extra.length ? `\n\n${extra.join("\n")}` : ""}`;
}

/**
 * The deterministic answer for any profile intent. Used as-is for the three
 * code-only intents' neighbours when a model fails, and as the whole answer when
 * the member's plan or daily allowance does not include a model turn.
 */
export function deterministicAnswer(
  intent: GrioIntent,
  f: ProfileTurnFacts,
  selected: SelectedEvidence,
  style: GrioAnswerStyle,
): string {
  switch (intent) {
    case "PROFILE_MISSING_INFO":
      return answerMissingInfo(f, style);
    case "KUNDALI_REQUEST":
      return answerKundli(f);
    case "SERVICE_DISCOVERY":
      return answerServices(f);
    case "NAVIGATION":
      return `${f.name} ki poori profile khol sakte hain — neeche se.`;
    case "PROFILE_FAMILY":
      return sectionBullets(f, "family", style);
    case "PROFILE_LIFESTYLE":
      return sectionBullets(f, "lifestyle", style);
    case "PROFILE_PREFERENCES":
      return sectionBullets(f, "expectations", style);
    case "PROFILE_COMPARE": {
      if (selected.similar.length === 0) return "Batayi hui jaankari me abhi koi seedha common point nahi mila.";
      return `Aap dono me ye milta hai:\n${cap(selected.similar, style, 5).map((r) => bullet(evidenceLine(r))).join("\n")}`;
    }
    case "PROFILE_DIFFERENCE": {
      if (selected.different.length === 0) return "Jitni baatein compare ho paayi, unme koi seedha farak nahi dikha.";
      return `In baaton me farak hai:\n${cap(selected.different, style, 5).map((r) => bullet(evidenceLine(r))).join("\n")}`;
    }
    case "MESSAGE_HELP": {
      const hobbies = f.sections.sections.lifestyle.facts.find((x) => x.key === "hobbies")?.value;
      const job = f.sections.sections.career.facts.find((x) => x.key === "job")?.value;
      const hook = hobbies ? `aapki profile me ${hobbies.split(",")[0].trim()} dekha` : job ? `aapka kaam (${job}) dekha` : "aapki profile dekhi";
      return `Baat shuru karne ke liye profile ki koi asli baat uthaiye. Jaise:\n“Namaste ${f.name} ji, ${hook} — isme aapko sabse achha kya lagta hai?”`;
    }
    case "PROFILE_SUMMARY": {
      const pick = (id: ProfileSectionId, keys: string[]) =>
        f.sections.sections[id].facts.filter((x) => keys.includes(x.key)).map((x) => `${x.label}: ${x.value}`);
      const lines = [
        ...pick("basics", ["age", "city", "maritalStatus"]),
        ...pick("education", ["education"]),
        ...pick("career", ["job"]),
        ...pick("family", ["familyType"]),
        ...pick("lifestyle", ["diet", "hobbies"]),
      ];
      if (lines.length === 0) return `${f.name} ki profile me abhi zyada jaankari nahi di gayi hai.`;
      return `${f.name} — profile se seedhi baatein:\n${cap(lines, style, 6).map(bullet).join("\n")}`;
    }
    case "PROFILE_FOR_ME":
    case "PROFILE_COMPATIBILITY":
    default: {
      const parts: string[] = [];
      if (selected.similar.length > 0) {
        parts.push(`Aapke liye kya mel khaata hai:\n${cap(selected.similar, style, 4).map((r) => bullet(evidenceLine(r))).join("\n")}`);
      } else {
        parts.push("Aapki batayi baaton se abhi koi seedha mel nahi dikhta.");
      }
      const check = [...selected.different, ...selected.unknown];
      if (check.length > 0) {
        parts.push(`Dhyaan dene layak:\n${cap(check, style, 3).map((r) => bullet(evidenceLine(r))).join("\n")}`);
      }
      return parts.join("\n\n");
    }
  }
}

/* ------------------------------------------------------------------ */
/* What to offer next                                                   */
/* ------------------------------------------------------------------ */

/**
 * Buttons under an answer — at most three, each an existing door. Labels are
 * English (the app's CTA convention); the member's question text stays Hinglish.
 */
export function profileActions(intent: GrioIntent, f: ProfileTurnFacts): GrioProfileAction[] {
  const r = f.relationship;
  const out: GrioProfileAction[] = [];
  const add = (a: GrioProfileAction) => {
    if (out.length < 3 && !out.some((x) => x.id === a.id)) out.push(a);
  };
  const kundli = kundliAvailable(f);

  switch (intent) {
    case "KUNDALI_REQUEST":
      if (kundli) add({ id: "kundli", kind: "open_kundli", label: "Open Kundli" });
      add({ id: "view", kind: "view_profile", label: "View profile" });
      break;
    case "PROFILE_FAMILY":
      add({ id: "family", kind: "open_section", label: "See family details", section: "family" });
      add({ id: "compare", kind: "ask", label: "What's common?", prompt: "Hum dono me kya common hai?" });
      break;
    case "PROFILE_LIFESTYLE":
      add({ id: "lifestyle", kind: "open_section", label: "See lifestyle", section: "lifestyle" });
      add({ id: "message", kind: "ask", label: "How to start a chat?", prompt: "Is profile se baat kaise shuru karun?" });
      break;
    case "PROFILE_PREFERENCES":
      add({ id: "expectations", kind: "open_section", label: "See expectations", section: "expectations" });
      break;
    case "MESSAGE_HELP":
      if (!r.matchId && !r.interestSent) add({ id: "interest", kind: "catalog", label: "Send interest", actionKey: "sendInterestToProfile" });
      add({ id: "about", kind: "open_section", label: "See details", section: "about" });
      break;
    case "PROFILE_MISSING_INFO":
      if (!r.matchId && !r.interestSent) add({ id: "interest", kind: "catalog", label: "Send interest", actionKey: "sendInterestToProfile" });
      add({ id: "view", kind: "view_profile", label: "View profile" });
      break;
    case "NAVIGATION":
      add({ id: "view", kind: "view_profile", label: "View profile" });
      break;
    case "SERVICE_DISCOVERY":
      if (kundli) add({ id: "kundli", kind: "open_kundli", label: "Open Kundli" });
      if (f.sections.sections.family.facts.length > 0) add({ id: "family", kind: "open_section", label: "Family details", section: "family" });
      add({ id: "compare", kind: "ask", label: "Compare", prompt: "Hum dono me kya common hai aur kya alag?" });
      break;
    default:
      add({ id: "about", kind: "open_section", label: "See details", section: "about" });
      add({ id: "compare", kind: "ask", label: "Compare", prompt: "Hum dono me kya common hai?" });
      if (kundli) add({ id: "kundli", kind: "open_kundli", label: "Open Kundli" });
      break;
  }
  return out;
}

interface SuggestionDef {
  id: string;
  label: string;
  ask: string;
  intent: GrioIntent;
}

const S = {
  forMe: { id: "for-me", label: "What's special for me?", ask: "Is profile me mere liye kya khaas hai?", intent: "PROFILE_FOR_ME" },
  family: { id: "family", label: "Family?", ask: "Family ke baare me batao.", intent: "PROFILE_FAMILY" },
  missing: { id: "missing", label: "What's missing?", ask: "Profile me kya missing hai?", intent: "PROFILE_MISSING_INFO" },
  lifestyle: { id: "lifestyle", label: "Lifestyle?", ask: "Iske lifestyle ke baare me batao.", intent: "PROFILE_LIFESTYLE" },
  common: { id: "common", label: "What's common?", ask: "Hum dono me kya common hai?", intent: "PROFILE_COMPARE" },
  different: { id: "different", label: "Differences?", ask: "Hum dono me kahan farak hai?", intent: "PROFILE_DIFFERENCE" },
  kundli: { id: "kundli", label: "Kundli?", ask: "Kundali available hai?", intent: "KUNDALI_REQUEST" },
  message: { id: "message", label: "How to start?", ask: "Is profile se baat kaise shuru karun?", intent: "MESSAGE_HELP" },
  summary: { id: "summary", label: "Quick summary", ask: "Is profile ka simple summary do.", intent: "PROFILE_SUMMARY" },
  know: { id: "know", label: "What should I know?", ask: "Is profile ke baare me mujhe kya jaanna chahiye?", intent: "PROFILE_FOR_ME" },
} satisfies Record<string, SuggestionDef>;

/**
 * The four opening chips, in fixed slots — the same position always means the
 * same kind of question, only the content of a slot follows the data (the
 * house rule: a rail that reshuffles is a rail nobody learns).
 *
 *   slot 1  what's special for me          (always)
 *   slot 2  family — or what's missing, when there is no family to talk about
 *   slot 3  lifestyle — or what's common, when lifestyle is empty
 *   slot 4  kundli when a milan exists — otherwise how to start a chat
 *
 * `prefer` lets the reel's own affinity pick slot 4 when both are real options
 * (a member who keeps opening kundli sees it; one who doesn't, doesn't).
 */
export function openingSuggestions(
  f: Pick<ProfileTurnFacts, "sections" | "kundli" | "evidence">,
  prefer: { kundliFirst?: boolean } = {},
): GrioPromptSuggestion[] {
  const familyKnown = f.sections.sections.family.facts.length > 0;
  const lifestyleKnown = f.sections.sections.lifestyle.facts.length > 0;
  const kundli = Boolean(f.kundli?.milan);
  return [
    S.forMe,
    familyKnown ? S.family : S.missing,
    lifestyleKnown ? S.lifestyle : S.common,
    kundli && prefer.kundliFirst !== false ? S.kundli : S.message,
  ];
}

/** Two or three chips after an answer — never the question just asked. */
export function followUpSuggestions(intent: GrioIntent, f: ProfileTurnFacts): GrioPromptSuggestion[] {
  const familyKnown = f.sections.sections.family.facts.length > 0;
  const pool: SuggestionDef[] =
    intent === "PROFILE_FOR_ME"
      ? [familyKnown ? S.family : S.missing, S.different, S.message]
      : intent === "PROFILE_FAMILY"
        ? [S.lifestyle, S.common, S.missing]
        : intent === "PROFILE_LIFESTYLE"
          ? [familyKnown ? S.family : S.missing, S.common, S.message]
          : intent === "PROFILE_COMPARE"
            ? [S.different, S.message, S.kundli]
            : intent === "PROFILE_DIFFERENCE"
              ? [S.common, S.know, S.message]
              : intent === "PROFILE_MISSING_INFO"
                ? [S.forMe, S.message]
                : intent === "KUNDALI_REQUEST"
                  ? [S.forMe, familyKnown ? S.family : S.missing]
                  : intent === "MESSAGE_HELP"
                    ? [S.common, S.missing]
                    : [S.forMe, familyKnown ? S.family : S.missing, S.common];
  const kundli = Boolean(f.kundli?.milan);
  return pool.filter((s) => s.intent !== intent && (s.id !== "kundli" || kundli)).slice(0, 3);
}
