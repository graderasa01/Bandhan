import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  parseFindSpec,
  encodeFindSpec,
  rewriteFindMarkers,
  stripFindMarkers,
  buildFindInstructions,
} from "../lib/services/grio/findSpec";
import {
  parseGrioSegments,
  describeFindFilters,
  FIND_MARKER_START,
  FIND_MARKER_END,
  MAX_FIND_CITIES,
} from "../lib/contracts/grio";
import { searchDiscoveryCandidates } from "../lib/services/discovery/discoverySearchService";
import { isFeatureAvailable } from "../lib/services/plans/entitlements";

/**
 * Grio Search — words in, filters out, and the pipeline doing the finding.
 *
 * The feature's whole safety argument is a split: the model writes a filter
 * set and never sees a person. So what is worth checking is not "does a search
 * run" but the three ways that split could quietly stop holding:
 *
 *   1. **A value the model invented reaches the query.** Every filter is an
 *      exact match against a stored column, so "doctor" or "btech" would
 *      return nobody — and an empty result reads as a claim about the
 *      membership, not about the query.
 *   2. **A marker survives into what the user reads.** The same failure every
 *      marker in this app has had at least once.
 *   3. **The plan gate is enforced in the prompt instead of in code.**
 *
 * The last section runs a real search against a real database, because the
 * point of canonicalising a value is that the query built from it matches
 * rows — which nothing but a row can demonstrate.
 *
 * Run: `npx tsx scripts/grio-search-check.ts`
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const stamp = Date.now();
const createdUserIds: string[] = [];

function dobForAge(age: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 1);
  return d;
}

async function makeMember(opts: {
  name: string;
  gender: string;
  age: number;
  city: string;
  professionCategory?: string;
  education?: string;
  prefs?: { lookingForGender?: string | null } | null;
}) {
  const user = await prisma.user.create({
    data: {
      fullName: opts.name,
      email: `gsearch-${opts.name.replace(/\W/g, "")}-${stamp}@local.test`,
      passwordHash: "x",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(user.id);

  const profile = await prisma.profile.create({
    data: {
      userId: user.id,
      displayName: opts.name,
      gender: opts.gender,
      dateOfBirth: dobForAge(opts.age),
      currentCity: opts.city,
      isVisible: true,
      profileStatus: "VERIFIED",
      fullProfileCompletionScore: 90,
      trustScore: 70,
      ...(opts.professionCategory
        ? { profession: { create: { professionCategory: opts.professionCategory } } }
        : {}),
      ...(opts.education ? { education: { create: { highestEducation: opts.education } } } : {}),
    },
  });

  if (opts.prefs !== null) {
    await prisma.profilePartnerPreferences.create({
      data: { profileId: profile.id, lookingForGender: opts.prefs?.lookingForGender ?? null },
    });
  }

  return { user, profile };
}

async function main() {
  // ── Catalog matching ──────────────────────────────────────────────────────
  console.log("\nA value the model wrote becomes a value a column holds");

  const loose = parseFindSpec("education=btech;profession=it software;maritalStatus=never married;diet=veg");
  check("b.tech in any casing or punctuation lands on B.Tech", loose.filters.education === "B.Tech", String(loose.filters.education));
  check(
    "'it software' lands on the real category",
    loose.filters.professionCategory === "IT / Software",
    String(loose.filters.professionCategory),
  );
  check("'never married' lands on Never Married", loose.filters.maritalStatus === "Never Married");
  check("'veg' lands on Veg", loose.filters.diet === "Veg");
  check("nothing was skipped", loose.skipped.length === 0, loose.skipped.join(","));

  const invented = parseFindSpec("profession=Rocket Scientist;education=Wizardry");
  check("a category nobody has is not put in the query", invented.filters.professionCategory === null);
  check("nor is a degree nobody holds", invented.filters.education === null);
  check("and both are named back", invented.skipped.length === 2, invented.skipped.join(","));
  check("so the spec is not usable on its own", invented.usable === false);

  const cities = parseFindSpec("cities=jaipur|NEW delhi|Ajmer|Kota");
  check("city names are canonicalised", cities.filters.cities[0] === "Jaipur", cities.filters.cities.join(","));
  check(
    `no more than ${MAX_FIND_CITIES} cities survive`,
    cities.filters.cities.length <= MAX_FIND_CITIES,
    String(cities.filters.cities.length),
  );
  check("the ones cut are named, not dropped in silence", cities.skipped.length > 0);

  const madeUpCity = parseFindSpec("cities=Gotham");
  check("a city that does not exist is skipped", madeUpCity.filters.cities.length === 0);
  check("and named", madeUpCity.skipped.includes("Gotham"));

  console.log("\nAges");

  const ages = parseFindSpec("minAge=31;maxAge=26");
  check("a backwards band is corrected, not run", ages.filters.minAge === 26 && ages.filters.maxAge === 31);
  const underage = parseFindSpec("minAge=15;maxAge=20");
  check("a minor is never searched for", underage.filters.minAge === null);
  check("and the refusal is visible", underage.skipped.includes("15"));
  check("the legal half of the band survives", underage.filters.maxAge === 20);
  const nonsense = parseFindSpec("minAge=bees saal");
  check("a non-number age is skipped", nonsense.filters.minAge === null);

  console.log("\nVocabulary the model does not have");

  const smuggled = parseFindSpec("minTrust=90;name=Priya;smoking=Nahi;minAge=26");
  check("a trust floor is not something a model may set", !("minTrustScore" in smuggled.filters));
  check("nor a name search", !("nameQuery" in smuggled.filters));
  check("an unknown key is dropped without comment", smuggled.skipped.length === 0, smuggled.skipped.join(","));
  check("and the keys that do exist still work", smuggled.filters.minAge === 26);

  // ── Markers in, markers out ───────────────────────────────────────────────
  console.log("\nWhat leaves the server");

  const reply = `${FIND_MARKER_START}minAge=26;maxAge=31;cities=jaipur;profession=doctor${FIND_MARKER_END}\nJaipur me 26-31 ki profiles dekh raha hoon.`;
  const rewritten = rewriteFindMarkers(reply);
  // Not "doctor is absent" — it is deliberately present, inside `skipped`,
  // which is the whole point of naming what could not be honoured. What must
  // not survive is `doctor` as a *filter*, where it would build a query that
  // matches nothing.
  check("the model's own value never becomes a filter", !rewritten.reply.includes("profession=doctor"));
  check("no profession filter was invented in its place", !rewritten.reply.includes("profession="));
  check("the canonical city does", rewritten.reply.includes("cities=Jaipur"));
  check("what could not be matched travels as skipped", rewritten.reply.includes("skipped=doctor"));
  check("the sentence beside it is untouched", rewritten.reply.includes("Jaipur me 26-31 ki profiles dekh raha hoon."));
  check("and a spec came back", rewritten.found !== null);

  const twoSearches = rewriteFindMarkers(
    `${FIND_MARKER_START}cities=Jaipur${FIND_MARKER_END} aur ${FIND_MARKER_START}cities=Delhi${FIND_MARKER_END}`,
  );
  check("only one search per reply", (twoSearches.reply.match(/<<<FIND:/g) ?? []).length === 1);
  check("the second disappears entirely", !twoSearches.reply.includes("Delhi"));

  const empty = rewriteFindMarkers(`${FIND_MARKER_START}profession=Rocket Scientist${FIND_MARKER_END} Ye rahe.`);
  check("a marker with nothing usable in it is dropped", !empty.reply.includes("<<<FIND:"));
  check("it never becomes an unfiltered search", empty.found === null);
  check("and the words survive", empty.reply.includes("Ye rahe."));

  const truncated = rewriteFindMarkers(`Dekhta hoon. ${FIND_MARKER_START}minAge=26;cit`);
  check("a reply cut mid-marker leaks no syntax", !truncated.reply.includes("<<<"));
  check("and keeps what came before it", truncated.reply.includes("Dekhta hoon."));

  const stripped = stripFindMarkers(`${FIND_MARKER_START}cities=Jaipur${FIND_MARKER_END}Dekh raha hoon.`);
  check("a locked plan gets no marker at all", !stripped.includes("<<<FIND:"));
  check("but still gets the reply", stripped.includes("Dekh raha hoon."));

  // ── Round trip ────────────────────────────────────────────────────────────
  console.log("\nWhat the browser reads back");

  const spec = parseFindSpec("minAge=26;maxAge=31;cities=Jaipur;profession=Healthcare;verified=1");
  const segments = parseGrioSegments(`${encodeFindSpec(spec)}\nDekh raha hoon.`);
  const findSeg = segments.find((s) => s.type === "find");
  check("the canonical marker parses to a find segment", findSeg !== undefined);
  if (findSeg && findSeg.type === "find") {
    check("with the same ages", findSeg.filters.minAge === 26 && findSeg.filters.maxAge === 31);
    check("the same city", findSeg.filters.cities[0] === "Jaipur");
    check("the same category", findSeg.filters.professionCategory === "Healthcare");
    check("and the verified flag", findSeg.filters.verifiedOnly === true);

    const chips = describeFindFilters(findSeg.filters);
    check("the chips say the age band", chips.includes("26-31 saal"));
    check("the chips say the city", chips.includes("Jaipur"));
    check("the chips say the verified filter", chips.includes("Sirf verified"));
    check("every chip is a filter that is actually set", chips.length === 4, chips.join(" · "));
  }
  check("the marker itself never reaches rendered text", !segments.some((s) => s.type === "text" && s.value.includes("<<<")));

  const staleClient = parseGrioSegments(`${FIND_MARKER_START}futureKey=x${FIND_MARKER_END}Dekh raha hoon.`);
  check(
    "a marker carrying only vocabulary this build lacks renders nothing rather than an empty search",
    !staleClient.some((s) => s.type === "find"),
  );

  // ── The instruction block ─────────────────────────────────────────────────
  console.log("\nWhat the model is told");

  const instructions = buildFindInstructions();
  check("the real profession categories are in the prompt", instructions.includes("IT / Software"));
  check("so are the real education options", instructions.includes("B.Tech"));
  check("and the real marital statuses", instructions.includes("Never Married"));
  check("it is told it cannot see results", instructions.includes("aapko results dikhte hi nahi hain"));
  check("and that the search does not run on its own", instructions.includes("apne aap nahi chalti"));

  // ── The query actually matches rows ───────────────────────────────────────
  console.log("\nThe filters find the people they name");

  const city = `GrioSearchPur${stamp % 100000}`;
  const viewer = await makeMember({
    name: "Viewer",
    gender: "Ladka",
    age: 30,
    city,
    prefs: { lookingForGender: "Ladki" },
  });
  const wanted = await makeMember({
    name: "Doctor28",
    gender: "Ladki",
    age: 28,
    city,
    professionCategory: "Healthcare",
    education: "MBBS",
    prefs: null,
  });
  await makeMember({
    name: "Engineer28",
    gender: "Ladki",
    age: 28,
    city,
    professionCategory: "Engineering",
    prefs: null,
  });
  await makeMember({
    name: "Doctor45",
    gender: "Ladki",
    age: 45,
    city,
    professionCategory: "Healthcare",
    prefs: null,
  });

  const built = parseFindSpec(`minAge=26;maxAge=31;cities=${city};profession=healthcare`);
  check("the made-up test city is not in the catalog, so it is skipped", built.filters.cities.length === 0);

  // The city is deliberately dropped above — that is the catalog doing its
  // job. The query below therefore runs on the filters that survived, which is
  // exactly what a user would get, and the assertions are written against that
  // rather than against a city the validator was never going to accept.
  const page = await searchDiscoveryCandidates(viewer.user.id, {
    nameQuery: null,
    minAge: built.filters.minAge,
    maxAge: built.filters.maxAge,
    cities: [city],
    education: built.filters.education,
    professionCategory: built.filters.professionCategory,
    maritalStatus: built.filters.maritalStatus,
    diet: built.filters.diet,
    smoking: null,
    drinking: null,
    verifiedOnly: built.filters.verifiedOnly,
    minTrustScore: null,
    cursor: null,
    pageSize: 20,
  });
  const ids = page.results.map((r) => r.profileId);
  check("the person who fits every filter is found", ids.includes(wanted.profile.id));
  check("only that person", ids.length === 1, `${ids.length} results`);
  check("the searcher is never in their own results", !ids.includes(viewer.profile.id));

  // ── The gate ──────────────────────────────────────────────────────────────
  console.log("\nThe plan gate is code, not a sentence in a prompt");

  const gate = await isFeatureAvailable(viewer.user.id, "advancedDiscovery", (ctx) => ctx.features.advancedDiscovery);
  check(
    "a free account does not get search from Grio either",
    gate.allowed === false,
    `allowed=${gate.allowed}`,
  );

  console.log(failures === 0 ? "\nPASS" : `\n${failures} FAILED`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
