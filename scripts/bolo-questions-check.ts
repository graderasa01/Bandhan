import assert from "node:assert/strict";
import { BOLO_KICKOFF_TEXT, boloGuestKickoff } from "../lib/bolo/agent";
import type { BoloValues } from "../lib/bolo/draft";
import {
  BOLO_ASK_ORDER,
  BOLO_PREFERENCE_ASK_ORDER,
  FILLING_FOR_ASK,
  askFor,
  chipFor,
  detectAskedField,
  displayDate,
  impliedGender,
  isPreferenceAsk,
  pendingAskKeys,
  readFillingFor,
  readTypedValue,
} from "../lib/bolo/questions";
import boloEnglish from "../lib/i18n/dictionaries/en/bolo";
import { FIELD_BY_KEY } from "../lib/profile/fields";
import { MINIMUM_LIVE_KEYS } from "../lib/profile/readiness";

/**
 * The question, the chips and the typed answers on `/bolo`, in code.
 *
 * Run: `npx tsx scripts/bolo-questions-check.ts`
 *
 *   1. The ask order covers exactly the eight minimum fields, plus "who for",
 *      and the two optional preferences come after them, never inside them.
 *   2. Every chip stores a value the profile accepts — on a select field one of
 *      its catalog options, which is the failure the tap deck taught us: a chip
 *      a letter off the catalog ticks, advances, and leaves the field empty.
 *   3. What is still pending, in Grio's order, and what is not — including the
 *      preference round: asked after the eighth answer, gone once skipped.
 *   4. The question on screen follows the field Grio names out loud.
 *   5. A typed line is taken as an answer only when it is a bare one.
 *   6. The guest kickoff says what is filled — keys, never values.
 *   7. Every question, hint and chip label has its English line.
 *
 * No database, no env, no browser.
 */

function main() {
  /* ---------------------------- 1. the order ---------------------------- */
  const fieldAsks = BOLO_ASK_ORDER.filter((key) => key !== FILLING_FOR_ASK);
  assert.deepEqual([...fieldAsks].sort(), [...MINIMUM_LIVE_KEYS].sort(), "the ask order lists exactly the minimum fields");
  assert.equal(BOLO_ASK_ORDER[0], FILLING_FOR_ASK, "who the profile is for is asked first");
  assert.equal(BOLO_ASK_ORDER[BOLO_ASK_ORDER.length - 1], "gender", "gender is asked last");
  assert.deepEqual([...BOLO_PREFERENCE_ASK_ORDER], ["partnerAgeRange", "partnerCityPreference"]);
  for (const key of BOLO_PREFERENCE_ASK_ORDER) {
    assert.ok(isPreferenceAsk(key), `${key} is an optional preference ask`);
    assert.ok(!BOLO_ASK_ORDER.includes(key), `${key} is never one of the eight`);
    assert.ok(askFor(key, null, {}).optional, `${key} is marked optional`);
  }
  assert.ok(!isPreferenceAsk("currentCity"), "a minimum field is not optional");
  console.log("1. ask order = who for + the 8 minimum fields, then the 2 preferences ✓");

  /* ---------------------------- 2. the chips ---------------------------- */
  const genders: BoloValues[] = [{}, { gender: "Ladka" }, { gender: "Ladki" }];
  for (const key of [...BOLO_ASK_ORDER, ...BOLO_PREFERENCE_ASK_ORDER]) {
    for (const values of genders) {
      const ask = askFor(key, null, values);
      // A skip chip is not an answer, so it does not spend one of the six.
      assert.ok(ask.chips.filter((chip) => !chip.skip).length <= 6, `${key}: at most six answer chips`);
      const skips = ask.chips.filter((chip) => chip.skip);
      assert.ok(skips.length <= 1, `${key}: at most one skip chip`);
      if (skips.length > 0) {
        assert.ok(isPreferenceAsk(key), `${key}: only an optional ask may be skipped`);
        assert.equal(skips[0]?.value, null, `${key}: a skip chip stores nothing`);
        assert.equal(ask.chips[ask.chips.length - 1]?.skip, true, `${key}: the skip chip comes last`);
      } else {
        assert.ok(!isPreferenceAsk(key), `${key}: an optional ask always offers a way out`);
      }
      const field = FIELD_BY_KEY[key];
      for (const chip of ask.chips) {
        if (chip.value === null) {
          assert.ok(chip.skip || (chip.placeholder && chip.placeholderKey), `${key}: a keyboard chip says what to type`);
          continue;
        }
        if (key === FILLING_FOR_ASK) {
          assert.ok(["self", "son", "daughter"].includes(chip.value), `who-for chip "${chip.value}"`);
          continue;
        }
        if (field?.type === "select") {
          assert.ok(field.options?.includes(chip.value), `${key}: chip "${chip.value}" is not a catalog option`);
        }
        assert.equal(readTypedValue(key, chip.value), chip.value, `${key}: chip "${chip.value}" typed out reads back as itself`);
      }
    }
    for (const who of [null, "self", "son", "daughter"] as const) {
      assert.ok(askFor(key, who, {}).question.trim().length > 0, `${key}: has a question for ${who ?? "nobody yet"}`);
    }
  }
  assert.deepEqual(askFor("fullName", null, {}).chips, [], "nobody suggests a name");
  assert.deepEqual(askFor("dateOfBirth", null, {}).chips, [], "nobody suggests a date of birth");
  assert.equal(chipFor("gender", "Ladki")?.labelKey, "bolo.chip.gender.Ladki");
  assert.equal(chipFor(FILLING_FOR_ASK, "son")?.label, "Bete ke liye");
  assert.equal(chipFor("currentCity", "Surat"), null);
  console.log("2. every chip stores an accepted value ✓");

  /* ---------------------------- 3. pending ------------------------------ */
  const full = {
    fullName: "Rahul Sharma",
    gender: "Ladka",
    dateOfBirth: "12/05/1995",
    height: `5'8"`,
    currentCity: "Jaipur",
    maritalStatus: "Never Married",
    education: "B.Tech",
    profession: "Software Engineer",
  };
  assert.deepEqual(pendingAskKeys(null, {}), [...BOLO_ASK_ORDER]);
  assert.deepEqual(pendingAskKeys("self", { fullName: "Rahul Sharma", gender: "Ladka" }), [
    "dateOfBirth",
    "height",
    "currentCity",
    "maritalStatus",
    "education",
    "profession",
  ]);
  assert.deepEqual(pendingAskKeys("self", full), [...BOLO_PREFERENCE_ASK_ORDER], "the eight are followed by the two");
  assert.deepEqual(
    pendingAskKeys("self", { ...full, partnerAgeRange: "25–29" }),
    ["partnerCityPreference"],
    "an answered preference drops out",
  );
  assert.deepEqual(
    pendingAskKeys("self", { ...full, partnerAgeRange: "25–29", partnerCityPreference: "Jaipur" }),
    [],
    "both answered: nothing left to ask",
  );
  assert.deepEqual(
    pendingAskKeys("self", full, [...BOLO_PREFERENCE_ASK_ORDER]),
    [],
    "a skipped preference is never asked again",
  );
  assert.deepEqual(
    pendingAskKeys("self", full, ["partnerAgeRange"]),
    ["partnerCityPreference"],
    "skipping one leaves the other",
  );
  assert.deepEqual(
    pendingAskKeys("self", { ...full, height: "" }, [...BOLO_PREFERENCE_ASK_ORDER]),
    ["height"],
    "a preference never comes before a field the profile needs",
  );
  assert.deepEqual(pendingAskKeys(null, full), [FILLING_FOR_ASK], "a full card still asks who it is for");
  assert.deepEqual(pendingAskKeys("self", { ...full, height: "5.13" }), ["height"], "an invalid value is still pending");
  assert.equal(impliedGender("son"), "Ladka");
  assert.equal(impliedGender("daughter"), "Ladki");
  assert.equal(impliedGender("self"), null);
  assert.equal(impliedGender(null), null);
  console.log("3. pending follows Grio's order; bete/beti answers gender ✓");

  /* ------------------------ 4. following the voice ----------------------- */
  const all = [...BOLO_ASK_ORDER];
  assert.equal(detectAskedField("Namaste! Profile kiske liye bana rahe hain — aapke liye ya bete/beti ke liye?", all), FILLING_FOR_ASK);
  assert.equal(detectAskedField("Badhiya. Ab height, aur abhi kaunse sheher me rehte hain?", all), "height");
  assert.equal(detectAskedField("Badhiya. Ab height, aur abhi kaunse sheher me rehte hain?", ["currentCity", "gender"]), "currentCity");
  assert.equal(detectAskedField("Aapka marital status, education aur profession?", all), "maritalStatus");
  assert.equal(detectAskedField("Aap kya kaam karte hain?", ["profession"]), "profession");
  assert.equal(detectAskedField("What is your date of birth?", all), "dateOfBirth");
  assert.equal(detectAskedField("Badhai ho, profile live hai.", all), null);
  assert.equal(detectAskedField("Theek hai.", all), null);
  assert.equal(detectAskedField("Height bataiye?", []), null, "an answered field never pulls the screen back");
  assert.equal(
    detectAskedField("Partner ki umar kitni ho, aur kaunse sheher se?", [...BOLO_PREFERENCE_ASK_ORDER]),
    "partnerAgeRange",
    "a batched preference question leads with the age",
  );
  assert.equal(detectAskedField("Partner kis sheher se ho?", [...BOLO_PREFERENCE_ASK_ORDER]), "partnerCityPreference");
  assert.equal(
    detectAskedField("Partner kis sheher se ho?", ["partnerAgeRange"]),
    null,
    "a skipped preference is never pulled back on screen",
  );
  console.log("4. the question on screen follows the field Grio names ✓");

  /* ------------------------- 5. typed answers --------------------------- */
  assert.equal(readTypedValue("currentCity", "jaipur"), "Jaipur");
  assert.equal(readTypedValue("currentCity", "Navi Mumbai"), "Navi Mumbai");
  assert.equal(readTypedValue("currentCity", "main jaipur me rehta hoon"), null);
  assert.equal(readTypedValue("fullName", "rahul sharma"), "Rahul Sharma");
  assert.equal(readTypedValue("fullName", "mera naam Rahul hai"), null);
  assert.equal(readTypedValue("fullName", "Rahul Sharma, 12 May 1995"), null);
  assert.equal(readTypedValue("dateOfBirth", "12 May 1995"), "12/05/1995");
  assert.equal(readTypedValue("dateOfBirth", "12 May, 1995"), "12/05/1995");
  assert.equal(readTypedValue("dateOfBirth", "31/02/1995"), null);
  assert.equal(readTypedValue("height", "5.8"), `5'8"`);
  assert.equal(readTypedValue("height", "5.13"), null);
  assert.equal(readTypedValue("maritalStatus", "unmarried"), "Never Married");
  assert.equal(readTypedValue("education", "btech"), "B.Tech");
  assert.equal(readTypedValue("education", "B.Tech, MBA"), null, "a list goes to the extractor");
  assert.equal(readTypedValue("gender", "main ladki hoon"), "Ladki");
  assert.equal(readTypedValue("profession", "main software engineer hoon"), null);
  assert.equal(readTypedValue("partnerAgeRange", "25 se 29"), "25–29");
  assert.equal(readTypedValue("partnerAgeRange", "35 plus"), "35+");
  assert.equal(readTypedValue("partnerAgeRange", "koi bhi umar"), null);
  assert.equal(readTypedValue("partnerCityPreference", "jaipur"), "Jaipur");
  assert.equal(readTypedValue("partnerCityPreference", "Jaipur, Delhi NCR"), "Jaipur, Delhi NCR", "a multiselect is a list");
  assert.equal(readTypedValue("partnerCityPreference", "Surat"), null, "a city outside the list goes to the extractor");
  assert.equal(readFillingFor("apne liye"), "self");
  assert.equal(readFillingFor("Mere bete ke liye"), "son");
  assert.equal(readFillingFor("beti"), "daughter");
  assert.equal(readFillingFor("for my daughter"), "daughter");
  assert.equal(readFillingFor("Jaipur"), null);
  assert.equal(displayDate("12/05/1995"), "12 May 1995");
  assert.equal(displayDate("1995-05-12"), "12 May 1995");
  assert.equal(displayDate("12/13/1995"), "12/13/1995");
  console.log("5. a typed line is an answer only when it is a bare one ✓");

  /* ------------------------- 6. guest kickoff ---------------------------- */
  assert.equal(boloGuestKickoff({ fillingFor: null, missing: MINIMUM_LIVE_KEYS }), BOLO_KICKOFF_TEXT);
  const partial = boloGuestKickoff({
    fillingFor: "self",
    missing: ["height", "currentCity"],
    values: { fullName: "Rahul Sharma" },
  });
  assert.ok(partial.includes("apne liye"), partial);
  assert.ok(partial.includes("fullName (Full Name)"), partial);
  assert.ok(partial.includes("Baaki: height (Height), currentCity (Current City) —"), partial);
  // The answers ride along, and one at a time is what the note asks for: a
  // kickoff that named the fields without their values left a restarted
  // session free to ask for a name it already had.
  assert.ok(partial.includes('fullName (Full Name) = "Rahul Sharma"'), partial);
  assert.ok(partial.includes("ek baar me sirf EK poochho"), partial);
  assert.ok(
    !boloGuestKickoff({ fillingFor: "self", missing: ["height"], values: { fullName: "Rahul]" } }).includes("Rahul]"),
    "a typed value cannot close the page's own bracketed note",
  );
  assert.ok(boloGuestKickoff({ fillingFor: "daughter", missing: MINIMUM_LIVE_KEYS }).includes("beti ke liye"));
  assert.ok(boloGuestKickoff({ fillingFor: "son", missing: [], confirmed: true }).includes("contact"));
  assert.ok(boloGuestKickoff({ fillingFor: "son", missing: [] }).includes("show_review"));
  const withPrefs = boloGuestKickoff({ fillingFor: "self", missing: [], preferencesPending: ["partnerAgeRange"] });
  assert.ok(withPrefs.includes("partnerAgeRange (Partner's Age)"), withPrefs);
  assert.ok(!withPrefs.includes("partnerCityPreference"), "a preference already given is not asked for again");
  console.log("6. the guest kickoff says what is filled, values and all ✓");

  /* --------------------------- 7. English ------------------------------- */
  for (const key of [...BOLO_ASK_ORDER, ...BOLO_PREFERENCE_ASK_ORDER]) {
    for (const who of [null, "son"] as const) {
      const ask = askFor(key, who, {});
      assert.ok(boloEnglish[ask.questionKey], `English missing: ${ask.questionKey}`);
      if (ask.hintKey) assert.ok(boloEnglish[ask.hintKey], `English missing: ${ask.hintKey}`);
      for (const chip of ask.chips) {
        if (chip.labelKey) assert.ok(boloEnglish[chip.labelKey], `English missing: ${chip.labelKey}`);
        if (chip.placeholderKey) assert.ok(boloEnglish[chip.placeholderKey], `English missing: ${chip.placeholderKey}`);
      }
    }
  }
  console.log("7. every question, hint and chip has its English line ✓");
}

main();
