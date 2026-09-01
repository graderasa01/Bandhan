import { FIELD_BY_KEY, PROFILE_FIELDS } from "../lib/profile/fields";
import {
  EDUCATION_TREE,
  HEIGHT_VALUES,
  INDIA_PLACES,
  PROFESSION_CATEGORIES,
  QUICK_PICKS,
  communitiesFor,
  composeAboutMe,
  pathToValue,
  professionCategoryFor,
  searchCities,
  type QuickNode,
} from "../lib/profile/quickPicks";
import { EDUCATION_FLOORS } from "../lib/services/match/preferenceScore";
import { isAnswered } from "../lib/profile/stages";

/**
 * The tap catalog's one hard rule, in code.
 *
 * Run: `npx tsx scripts/quick-picks-check.ts`
 *
 * **A chip must store a value the rest of the app already accepts.** For a
 * `select` field that means the value has to be one of that field's own
 * `options`, because `isAnswered` rejects anything else — so a chip with a
 * value slightly off the catalog's spelling does not error, it silently
 * answers a question and leaves the field reading as empty. That failure is
 * invisible in the UI (the chip ticks, the card advances) and only shows up
 * later as a profile that will not go live. This is what makes it loud.
 *
 * Everything else here guards the same class of quiet drift: three lists that
 * have to agree about degrees, a work tree that has to produce a category the
 * discovery filter can use, and a place list that has to be searchable.
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

function leaves(nodes: QuickNode[]): string[] {
  return nodes.flatMap((n) => (n.children?.length ? leaves(n.children) : [n.value ?? n.label]));
}

console.log("\nquickPicks — stored values");

/* ------------------------------------------------------------------ */
/* 1. The hard rule                                                    */
/* ------------------------------------------------------------------ */

for (const [key, spec] of Object.entries(QUICK_PICKS)) {
  const field = FIELD_BY_KEY[key];
  check(`${key} is a real catalog field`, Boolean(field));
  if (!field) continue;

  const stored: string[] = [];
  if (spec.input.kind === "chips") stored.push(...leaves(spec.input.nodes));
  if (spec.input.kind === "wheel") stored.push(...spec.input.values);
  if (spec.input.kind === "stepper") stored.push(...spec.input.stops);
  for (const esc of spec.escapes ?? []) if (esc.value) stored.push(esc.value);

  if (field.type === "select") {
    const allowed = new Set(field.options ?? []);
    const bad = stored.filter((v) => !allowed.has(v));
    check(`${key}: every chip stores a valid option`, bad.length === 0, bad.join(", "));

    // The other half of the same rule: a free-text escape hatch on a select
    // would store something `isAnswered` rejects the moment it is typed.
    check(`${key}: no free-text fallback on a select`, spec.other !== true);
  }

  // A branch has to ask something, or the card morphs to a question-less
  // screen and the user is looking at chips with no idea what they answer.
  const missingAsk: string[] = [];
  const walk = (nodes: QuickNode[]) => {
    for (const n of nodes) {
      if (n.children?.length) {
        if (!n.ask) missingAsk.push(n.label);
        walk(n.children);
      }
    }
  };
  if (spec.input.kind === "chips") walk(spec.input.nodes);
  check(`${key}: every branch asks a question`, missingAsk.length === 0, missingAsk.join(", "));
}

check(
  "every catalog field is either tappable or deliberately not",
  PROFILE_FIELDS.every((f) => f.type === "photo" || Boolean(QUICK_PICKS[f.key])),
  PROFILE_FIELDS.filter((f) => f.type !== "photo" && !QUICK_PICKS[f.key])
    .map((f) => f.key)
    .join(", "),
);

/* ------------------------------------------------------------------ */
/* 2. The three lists that must agree about degrees                    */
/* ------------------------------------------------------------------ */

console.log("\neducation — catalog, tree, floors");

const eduOptions = FIELD_BY_KEY.education.options ?? [];
const eduLeaves = leaves(EDUCATION_TREE);

check(
  "the tree reaches every education option",
  eduOptions.every((o) => eduLeaves.includes(o)),
  eduOptions.filter((o) => !eduLeaves.includes(o)).join(", "),
);

// "Other" says nothing, so it is in no floor on purpose — reading it as
// "graduate or above" would be a guess made in the candidate's favour that
// they never made themselves.
const gradFloor = EDUCATION_FLOORS["Graduate ya upar"];
const unscored = eduOptions.filter(
  (o) => !gradFloor.includes(o) && !["10th", "12th", "Diploma", "ITI", "Other"].includes(o),
);
check("every degree above 12th clears the graduate bar", unscored.length === 0, unscored.join(", "));

check(
  "no floor names a degree the catalog does not offer",
  Object.values(EDUCATION_FLOORS).every((list) => list.every((d) => eduOptions.includes(d))),
);

check(
  "the post-graduate bar is a subset of the graduate bar",
  EDUCATION_FLOORS["Post Graduate ya upar"].every((d) => gradFloor.includes(d)),
);

/* ------------------------------------------------------------------ */
/* 3. Height                                                           */
/* ------------------------------------------------------------------ */

console.log("\nheight");

check("the wheel and the catalog offer the same heights", HEIGHT_VALUES.join("|") === (FIELD_BY_KEY.height.options ?? []).join("|"));
check("every inch is present", HEIGHT_VALUES.includes("5'7\"") && HEIGHT_VALUES.includes("6'1\""));
check(
  "the old two-inch list still validates",
  ["4'6\"", "5'0\"", "5'6\"", "6'0\"", "6'2\""].every((h) => isAnswered(FIELD_BY_KEY.height, { height: h })),
);

/* ------------------------------------------------------------------ */
/* 4. Work → category, the thing the discovery filter reads            */
/* ------------------------------------------------------------------ */

console.log("\nprofession → category");

check("a tree role maps", professionCategoryFor("Software Engineer") === "IT / Software");
check("case does not matter", professionCategoryFor("software engineer") === "IT / Software");
check("a business leaf maps", professionCategoryFor("Business — Retail") === "Business");
check("a hand-typed title falls back on keywords", professionCategoryFor("Senior Software Developer") === "IT / Software");
check("an unknown title stays unknown", professionCategoryFor("Astronaut") === undefined);
check("an empty title stays unknown", professionCategoryFor("") === undefined);
check("the filter has a category list to offer", PROFESSION_CATEGORIES.length > 5);

/* ------------------------------------------------------------------ */
/* 5. Places                                                           */
/* ------------------------------------------------------------------ */

console.log("\nplaces");

const allCities = INDIA_PLACES.flatMap((s) => s.cities);
check("no state is empty", INDIA_PLACES.every((s) => s.cities.length > 0));
check("a prefix search finds the city", searchCities("jaip").some((r) => r.city === "Jaipur"));
check("search needs two characters", searchCities("j").length === 0);
check("the popular cities are all real", ["Jaipur", "Delhi", "Bengaluru"].every((c) => allCities.includes(c)));

/* ------------------------------------------------------------------ */
/* 6. The bits the deck leans on                                       */
/* ------------------------------------------------------------------ */

console.log("\nhelpers");

check(
  "a cascade value can be walked back to its path",
  (pathToValue(
    (QUICK_PICKS.profession.input as { nodes: QuickNode[] }).nodes,
    "Software Engineer",
  ) ?? []).map((n) => n.label).join(" > ") === "Job > IT / Software > Software Engineer",
);
check("an unknown value has no path", pathToValue(EDUCATION_TREE, "Astronaut") === null);
check("community follows religion", communitiesFor("Sikh").includes("Jat Sikh"));
check("an unanswered religion still offers a list", communitiesFor(undefined).length > 0);

const bio = composeAboutMe(
  { traits: ["Calm", "Practical"], weekend: ["Family ke saath"], values: ["Respect"] },
  { forSelf: true },
);
check("About Me composes in the first person", bio.startsWith("Main calm aur practical hoon."), bio);
const bioForChild = composeAboutMe({ traits: ["Calm"] }, { forSelf: false, name: "Priya Sharma" });
check("and in the third person for a parent", bioForChild.startsWith("Priya calm hain."), bioForChild);
check("nothing tapped composes to nothing", composeAboutMe({}, { forSelf: true }) === "");

console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
process.exit(failures === 0 ? 0 : 1);
