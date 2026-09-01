import { PROFILE_FIELDS } from "../lib/profile/fields";
import {
  FIELD_CATEGORIES,
  categoryOf,
  categoryProgress,
  fieldsInCategory,
  isFieldCategoryKey,
} from "../lib/profile/fieldGroups";
import { isAnswered, type ProfileValues } from "../lib/profile/stages";

/**
 * The category layer, and the one property it exists to guarantee.
 *
 * Run: `npx tsx scripts/profile-groups-check.ts`
 *
 * `categoryOf` falls back to "basics" for an unmapped key rather than throwing,
 * because a field rendering in the wrong section is recoverable and a field
 * vanishing off the dashboard is the exact bug this work removed. That fallback
 * makes the failure silent, so this is what makes it loud instead: every key in
 * `PROFILE_FIELDS` must be mapped **explicitly**, and adding a field to the
 * catalog without giving it a home fails here.
 *
 * No database, no env — pure catalog checks.
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nEvery field has a home");

// The real test. `categoryOf` can't report "unmapped", so this reconstructs
// the question by asking whether the field appears in the category it claims —
// which it always will — and then separately proving the union covers the
// catalog exactly. A key relying on the fallback shows up as a "basics" member
// that its own stage/label has nothing to do with, so the count check below is
// what actually catches it.
const grouped = FIELD_CATEGORIES.flatMap((c) => fieldsInCategory(c.key).map((f) => f.key));
const fillable = PROFILE_FIELDS.filter((f) => f.type !== "photo").map((f) => f.key);

check(
  "every fillable field appears in exactly one category",
  grouped.length === fillable.length && new Set(grouped).size === grouped.length,
  `grouped ${grouped.length}, fillable ${fillable.length}, unique ${new Set(grouped).size}`,
);

const missing = fillable.filter((k) => !grouped.includes(k));
check("and none is left out", missing.length === 0, missing.join(", "));

// Guards the fallback directly: a key nobody mapped lands in "basics", so
// "basics" holding anything beyond the identity fields is the signature of a
// field that was added to fields.ts and never categorised.
const EXPECTED_BASICS = [
  "fullName",
  "gender",
  "dateOfBirth",
  "height",
  "currentCity",
  "maritalStatus",
  "motherTongue",
];
const basics = fieldsInCategory("basics").map((f) => f.key);
check(
  "nothing has silently fallen back into basics",
  basics.length === EXPECTED_BASICS.length && EXPECTED_BASICS.every((k) => basics.includes(k)),
  `unexpected: ${basics.filter((k) => !EXPECTED_BASICS.includes(k)).join(", ") || "none"}`,
);

check("photos is its own category, not mixed in", categoryOf("photos") === "photos");
check(
  "and photos never reaches a fillable list",
  !grouped.includes("photos"),
  "isAnswered can never see a photo as filled — it would pin itself to every deck",
);

console.log("\nThe partner group is the one that earns a separate entry point");

const partner = fieldsInCategory("partner").map((f) => f.key);
check("all seven partner* fields are in it", partner.filter((k) => k.startsWith("partner")).length === 7, partner.join(", "));
check("relocation is too, despite not matching the prefix", partner.includes("relocateWilling"));
check("and deal breakers", partner.includes("dealBreakers"));
check(
  "it is small enough to finish in one sitting",
  partner.length <= 10,
  `${partner.length} fields — a swipe run past ten stops feeling finishable`,
);
check(
  "and nothing about the user themselves leaked in",
  !partner.includes("religion") && !partner.includes("caste") && !partner.includes("manglikStatus"),
  "own religion/caste/manglik are background+kundli — filing them here would read as a preference",
);

console.log("\nProgress reflects real answers");

const empty: ProfileValues = {};
const rowsEmpty = categoryProgress(empty);
check("a blank profile has every section pending", rowsEmpty.every((r) => r.filled.length === 0));
check("and no section is empty of fields", rowsEmpty.every((r) => r.pending.length > 0));
check(
  "sections keep catalog order, never reshuffled by urgency",
  rowsEmpty.map((r) => r.category.key).join(",") ===
    FIELD_CATEGORIES.filter((c) => fieldsInCategory(c.key).length > 0).map((c) => c.key).join(","),
);
check(
  "required fields sort ahead of optional inside a section",
  rowsEmpty.every((r) => {
    const firstOptional = r.pending.findIndex((f) => !f.required);
    return firstOptional === -1 || r.pending.slice(firstOptional).every((f) => !f.required);
  }),
);

// One real answer moves exactly one field, in exactly one section.
const filledOne: ProfileValues = { currentCity: "Jaipur" };
const rowsOne = categoryProgress(filledOne);
const basicsRow = rowsOne.find((r) => r.category.key === "basics")!;
check("answering one field fills it", basicsRow.filled.map((f) => f.key).join() === "currentCity");
check(
  "and moves it out of pending",
  !basicsRow.pending.some((f) => f.key === "currentCity"),
);
check(
  "while every other section is untouched",
  rowsOne.filter((r) => r.category.key !== "basics").every((r) => r.filled.length === 0),
);

// A select answer outside its option list is not an answer (stages.ts) — the
// grouping must inherit that rule rather than re-deciding what "filled" means.
const bogus: ProfileValues = { diet: "Something not on the list" };
const lifestyle = categoryProgress(bogus).find((r) => r.category.key === "lifestyle")!;
check(
  "an off-catalog select value still counts as pending",
  lifestyle.pending.some((f) => f.key === "diet") && lifestyle.filled.length === 0,
);

console.log("\nCategory keys survive a round trip through a URL");

check("known keys validate", FIELD_CATEGORIES.every((c) => isFieldCategoryKey(c.key)));
check("unknown ones do not", !isFieldCategoryKey("partner; drop table") && !isFieldCategoryKey(null));

console.log("\nThe totals the card renders");

const total = fillable.length;
const shown = categoryProgress(empty).reduce((n, r) => n + r.filled.length + r.pending.length, 0);
check("sections add up to the whole fillable catalog", shown === total, `${shown} vs ${total}`);
check(
  "and every field the old flat list showed is still reachable",
  PROFILE_FIELDS.filter((f) => f.type !== "photo").every((f) =>
    fieldsInCategory(categoryOf(f.key)).some((g) => g.key === f.key),
  ),
);

// Sanity on the helper the deck relies on, so a change to isAnswered that
// breaks grouping fails here rather than in a swipe deck.
check(
  "isAnswered agrees with the split",
  categoryProgress({ profession: "CA" }).every((r) =>
    r.filled.every((f) => isAnswered(f, { profession: "CA" })) &&
    r.pending.every((f) => !isAnswered(f, { profession: "CA" })),
  ),
);

console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
process.exit(failures === 0 ? 0 : 1);
