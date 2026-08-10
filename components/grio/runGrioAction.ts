"use client";

import { GRIO_ACTIONS, GRIO_OUTCOME_MATCHED, type GrioActionKey, type GrioActionSpec } from "@/lib/contracts/grio";

/**
 * The one place a catalog row actually becomes an HTTP call.
 *
 * Lifted out of `GrioActionChips.runPending` when `<<<DO:` arrived and the same
 * row needed two ways in: a chip the user taps, and a spoken request that runs
 * without one. Two copies of "build the call, post it, read the outcome" would
 * have been two places for the confirm-vs-run rules to drift apart — and the
 * one that drifts is always the one nobody is looking at.
 *
 * Deliberately not a hook and deliberately UI-free: no toast, no state, no
 * router. It returns what happened and lets each caller present it, because the
 * chip has a sheet to close and the auto-run path has a transcript line to
 * append, and neither should have to pretend to be the other.
 */

export type RunGrioActionResult =
  | {
      ok: true;
      /** Catalog copy for the success toast. */
      done: string | null;
      /**
       * The sentence written back into the conversation, already carrying the
       * "and it matched" suffix when the endpoint reported one. Callers must
       * append this: the model reads the transcript next turn, and without it
       * Grio offers a button the user has already used.
       */
      outcome: string | null;
    }
  | { ok: false; message: string | null };

export async function runGrioAction(
  key: GrioActionKey,
  /** Always code-supplied — the open profile or a resolved roster ordinal, never a model-written id. */
  targetProfileId: string | null,
): Promise<RunGrioActionResult> {
  const spec = GRIO_ACTIONS[key] as GrioActionSpec;

  // A targeted row without a target is a bug in the caller, not a request to
  // guess: `request` is what turns an id into a URL, so there is no call to make.
  if (spec.needs && !targetProfileId) {
    return { ok: false, message: null };
  }

  const call =
    spec.request && targetProfileId
      ? spec.request(targetProfileId)
      : { url: spec.endpoint!, method: "POST" as const, body: undefined };

  try {
    const res = await fetch(call.url, {
      method: call.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(call.body ?? {}),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      matched?: boolean;
    };

    // The endpoint's own gate is the authority, not the fact that Grio offered
    // or the user asked — plan limits, quotas and ownership all live there.
    if (!res.ok || json.ok === false) {
      return { ok: false, message: json.message ?? null };
    }

    const base = spec.outcome ?? spec.done ?? null;
    return {
      ok: true,
      done: spec.done ?? null,
      outcome: base ? (json.matched ? `✓ ${base} ${GRIO_OUTCOME_MATCHED}` : `✓ ${base}`) : null,
    };
  } catch {
    return { ok: false, message: null };
  }
}
