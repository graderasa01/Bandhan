import en from "../lib/i18n/dictionaries/en";
import { catalogKey } from "../lib/i18n/catalogKeys";
import { FIELD_CATEGORIES } from "../lib/profile/fieldGroups";
import {
  INTELLIGENCE_LAYERS,
  INTELLIGENCE_QUESTIONS,
  DEAL_BREAKER_LABEL,
} from "../lib/profile/intelligenceQuestions";

/**
 * Every catalog string a screen can print has an English line.
 *
 * Run: `npx tsx scripts/i18n-catalog-check.ts`
 *
 * `t()` degrades to its Hinglish fallback when a key is missing, which is the
 * right behaviour for a hand-written call site — a half-translated sentence is
 * worse than an untranslated one. It is the wrong behaviour for these two
 * catalogs: their strings are the *content* of the profile sections and the
 * Marriage Intelligence flow, so a missing key does not degrade a label, it
 * puts a Hinglish question inside an English questionnaire. That is exactly
 * the bug this check exists to stop coming back — a question added to
 * `intelligenceQuestions.ts` without a line in `dictionaries/en/profileCatalog`
 * fails here rather than shipping.
 *
 * It also checks the reverse direction: a key in the dictionary that no
 * catalog entry can ever ask for is dead weight left behind by a rename.
 *
 * No database, no env — two catalogs and a dictionary.
 */

let failures = 0;
const expected = new Set<string>();

function need(key: string, what: string) {
  expected.add(key);
  if (en[key]) return;
  failures++;
  console.log(`  FAIL missing — ${key}   (${what})`);
}

console.log("\nProfile sections");
for (const c of FIELD_CATEGORIES) {
  need(catalogKey.categoryLabel(c.key), c.label);
  need(catalogKey.categoryHint(c.key), c.hint);
}

console.log("Intelligence layers");
for (const l of INTELLIGENCE_LAYERS) {
  need(catalogKey.layerTitle(l.key), l.title);
  need(catalogKey.layerUnlocks(l.key), l.unlocks);
  for (const k of l.alreadyKnown ?? []) need(catalogKey.knownLabel(k.field), k.label);
}

console.log("Intelligence questions");
for (const q of INTELLIGENCE_QUESTIONS) {
  need(catalogKey.questionLabel(q.key), q.label);
  need(catalogKey.questionText(q.key), q.question);
  need(catalogKey.questionForChild(q.key), q.questionForChild);
  need(catalogKey.questionWhy(q.key), q.whyNeeded);
  // The option key is the stored value; the deal-breaker questions store codes
  // and render DEAL_BREAKER_LABEL, so that is what the line has to translate.
  for (const o of q.options) need(catalogKey.option(o), DEAL_BREAKER_LABEL[o] ?? o);
}

console.log("No orphans");
const orphans = Object.keys(en).filter(
  (k) =>
    (k.startsWith("profile.fieldCategory.") ||
      k.startsWith("profile.intelligence.layer.") ||
      k.startsWith("profile.intelligence.known.") ||
      k.startsWith("profile.intelligence.q.") ||
      k.startsWith("profile.intelligence.option.")) &&
    !expected.has(k),
);
for (const k of orphans) {
  failures++;
  console.log(`  FAIL orphan — ${k} is in the dictionary but no catalog entry asks for it`);
}

console.log(
  `\n${expected.size} catalog strings checked, ${orphans.length} orphan(s)\n` +
    `${failures === 0 ? "PASS" : `FAIL — ${failures} problem(s)`}`,
);
process.exit(failures === 0 ? 0 : 1);
