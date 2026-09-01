import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  addMemoryEntry,
  clearMemory,
  formatMemoryEntries,
  getMemory,
  getMemoryEntries,
  removeMemoryEntry,
} from "../lib/services/grio/memory";
import { GRIO_MEMORY_KINDS } from "../lib/contracts/grio";
import { GrioMemoryKind } from "@prisma/client";

/**
 * Typed Grio memory, against a real database.
 *
 * Run: `npx tsx scripts/grio-memory-check.ts`
 *
 * The property worth protecting is the one flat strings could not express:
 *
 *   **A preference that changed is one memory, not two contradictory ones.**
 *
 * So the tests below do not check that entries save — they check that a
 * superseded entry stops reaching the model, that the replaced text survives as
 * history rather than being deleted, and that replacing is still possible when
 * the plan cap is already full (the one case where refusing would strand a user
 * with an outdated memory they are not allowed to fix).
 */

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

let userId: string | null = null;

async function main() {
  console.log("\nThe client-side kind list matches the database enum");

  /*
   * `GRIO_MEMORY_KINDS` is re-declared in `lib/contracts/grio.ts` rather than
   * imported from `@prisma/client`, because that module is imported by client
   * components and pulling the Prisma client into a browser bundle to read six
   * string literals is a bad trade. This is the assertion that keeps the copy
   * honest — the compile-time link the re-declaration gives up.
   */
  const dbKinds = Object.values(GrioMemoryKind).sort();
  const contractKinds = [...GRIO_MEMORY_KINDS].sort();
  check(
    "no kind exists in the schema that the UI cannot render",
    JSON.stringify(dbKinds) === JSON.stringify(contractKinds),
    `db=${dbKinds.join(",")} contract=${contractKinds.join(",")}`,
  );

  const user = await prisma.user.create({
    data: {
      fullName: "Memory Check",
      email: `memory-check+${Date.now()}@local.test`,
      passwordHash: "not-a-login",
      status: "INCOMPLETE",
    },
  });
  userId = user.id;

  try {
    console.log("\nBasics still work");

    await addMemoryEntry(user.id, "Main TCS me kaam karta hoon", 8);
    check("a plain entry saves", (await getMemory(user.id)).includes("Main TCS me kaam karta hoon"));
    check("and defaults to FACT", (await getMemoryEntries(user.id))[0]?.kind === "FACT");

    const dup = await addMemoryEntry(user.id, "main tcs me kaam karta hoon", 8);
    check("a case-insensitive duplicate is a no-op, not an error", dup.ok);
    check("and does not create a second row", (await getMemoryEntries(user.id)).length === 1);

    console.log("\nKinds are stored, not guessed");

    await addMemoryEntry(user.id, "Smoking bilkul nahi", 8, { kind: "BOUNDARY" });
    await addMemoryEntry(user.id, "Ek saal me shaadi", 8, { kind: "GOAL" });
    const kinds = (await getMemoryEntries(user.id)).map((e) => e.kind);
    check("a boundary keeps its kind", kinds.includes("BOUNDARY"));
    check("a goal keeps its kind", kinds.includes("GOAL"));

    console.log("\nSupersession — the reason this table exists");

    const addPref = await addMemoryEntry(user.id, "Bangalore preferred", 8, { kind: "PREFERENCE" });
    const oldPref = addPref.ok ? addPref.entries.find((e) => e.body === "Bangalore preferred") : null;
    check("the original preference is live", Boolean(oldPref));

    const replaced = await addMemoryEntry(user.id, "Mumbai bhi theek hai", 8, {
      kind: "PREFERENCE",
      supersedesId: oldPref!.id,
    });
    check("replacing succeeds", replaced.ok);

    const live = await getMemoryEntries(user.id);
    check(
      "the superseded entry stops reaching the model",
      !live.some((e) => e.body === "Bangalore preferred"),
      live.map((e) => e.body).join(" | "),
    );
    check("the new one is live", live.some((e) => e.body === "Mumbai bhi theek hai"));
    check(
      "and it remembers what it replaced",
      live.find((e) => e.body === "Mumbai bhi theek hai")?.replaces === "Bangalore preferred",
    );

    // Marked, not deleted. "What did I used to think" stays answerable.
    const oldRow = await prisma.grioMemoryEntry.findUnique({ where: { id: oldPref!.id } });
    check("the replaced row still exists", oldRow !== null);
    check("but is stamped with when it was replaced", oldRow?.replacedAt !== null);

    console.log("\nReplacing is allowed at a full memory");

    /*
     * The one case where enforcing the cap would make the memory worse: a user
     * at their limit could never correct an outdated preference. A supersede is
     * net-zero — one row in, one row out — so it is not a new entry.
     */
    const full = await getMemoryEntries(user.id);
    const atLimit = full.length;
    const blocked = await addMemoryEntry(user.id, "Kuch bilkul naya", atLimit);
    check("a genuinely new entry is refused at the cap", !blocked.ok);

    const correction = await addMemoryEntry(user.id, "Ab Pune bhi chalega", atLimit, {
      kind: "PREFERENCE",
      supersedesId: full.find((e) => e.body === "Mumbai bhi theek hai")!.id,
    });
    check("but a correction is still allowed", correction.ok);
    check(
      "and live memory did not grow",
      (await getMemoryEntries(user.id)).length === atLimit,
      String((await getMemoryEntries(user.id)).length),
    );

    console.log("\nAnother user's entry cannot be replaced");

    const other = await prisma.user.create({
      data: {
        fullName: "Other",
        email: `memory-other+${Date.now()}@local.test`,
        passwordHash: "not-a-login",
        status: "INCOMPLETE",
      },
    });
    try {
      await addMemoryEntry(other.id, "Unki apni baat", 8);
      const theirs = (await getMemoryEntries(other.id))[0];

      await addMemoryEntry(user.id, "Chori ki koshish", 40, { supersedesId: theirs.id });
      const stillTheirs = await prisma.grioMemoryEntry.findUnique({ where: { id: theirs.id } });
      check("their entry is untouched", stillTheirs?.replacedAt === null);
      check(
        "and the attempt still saved as a new entry rather than failing",
        (await getMemoryEntries(user.id)).some((e) => e.body === "Chori ki koshish"),
        "a bad replace-target is not a reason to lose what the user typed",
      );
    } finally {
      await prisma.user.delete({ where: { id: other.id } }).catch(() => {});
    }

    console.log("\nTemporary memory expires on its own");

    await addMemoryEntry(user.id, "Agle mahine Mumbai me hoon", 40, { kind: "TEMPORARY_CONTEXT" });
    const temp = (await getMemoryEntries(user.id)).find((e) => e.body === "Agle mahine Mumbai me hoon");
    check("a temporary memory gets an expiry without being asked", temp?.expiresAt !== null);

    await addMemoryEntry(user.id, "Ye kal khatam ho jayega", 40, {
      kind: "TEMPORARY_CONTEXT",
      expiresAt: new Date(Date.now() - 1000),
    });
    check(
      "an already-expired entry never reaches the model",
      !(await getMemory(user.id)).includes("Ye kal khatam ho jayega"),
      "expiry is evaluated on read, not swept by a job — a stale note is wrong the instant it expires",
    );

    console.log("\nThe block the model reads");

    const block = formatMemoryEntries(await getMemoryEntries(user.id));
    check("boundaries are introduced as lines, not preferences", block.includes("saaf lakeer"));
    check("preferences are flagged as changeable", block.includes("badal sakti hai"));
    check("temporary context warns against long-term advice", block.includes("lambi salah"));
    check(
      "a corrected preference carries its history into the prompt",
      block.includes("pehle"),
      "without this Grio treats a correction as a fresh surprise",
    );
    check("a superseded body never appears", !block.includes("Bangalore preferred"));

    console.log("\nDelete is a real delete");

    const toDelete = (await getMemoryEntries(user.id))[0];
    await removeMemoryEntry(user.id, toDelete.id);
    check(
      "a deleted entry leaves no hidden row",
      (await prisma.grioMemoryEntry.findUnique({ where: { id: toDelete.id } })) === null,
      "supersession keeps history because the user said 'this changed'; delete means 'never know this'",
    );

    await clearMemory(user.id);
    check("clear removes everything", (await getMemoryEntries(user.id)).length === 0);
    check(
      "including replaced history",
      (await prisma.grioMemoryEntry.count({ where: { userId: user.id } })) === 0,
    );

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
