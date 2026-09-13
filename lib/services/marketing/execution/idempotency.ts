import { sha256Hex } from "./hashing";

/**
 * One execution identity per deployment (§9.1).
 *
 * `idempotencyKey` is the doc's formula — platform + account + draft + spec
 * hash + create approval — hashed, so it is unique per authorised execution
 * and changes when a fresh card is issued for the same draft.
 *
 * `executionMarker` is different on purpose: it is derived from the
 * deployment id alone, assigned once, and never regenerated. It is the
 * string reconciliation searches for on the provider, and a marker that
 * changed with every new card would lose track of objects an earlier
 * attempt may have created. The deployment row is the identity that lives
 * for the whole campaign; the card is just the latest authorisation.
 */

export function idempotencyKeyOf(input: { platform: string; accountRef: string | null; draftId: string; specHash: string; createApprovalId: string | null }): string {
  return sha256Hex([input.platform, input.accountRef ?? "-", input.draftId, input.specHash, input.createApprovalId ?? "-"].join("|"));
}

/** "BT:" + 10 hex chars — short enough for a campaign name, unique enough to search for. */
export function executionMarkerOf(deploymentId: string): string {
  return `BT:${sha256Hex(`marker|${deploymentId}`).slice(0, 10)}`;
}

/** Google campaign names are capped at 255 chars; the marker must survive the cap. */
const PROVIDER_NAME_MAX = 255;

export function providerCampaignName(baseName: string, marker: string): string {
  const suffix = ` [${marker}]`;
  const clean = baseName.replace(/\s+/g, " ").replace(/[[\]]/g, "").trim() || "BandhanTak campaign";
  const room = PROVIDER_NAME_MAX - suffix.length;
  return `${clean.length > room ? clean.slice(0, room).trimEnd() : clean}${suffix}`;
}

/** Whether a provider object name carries this deployment's marker — the ownership test used by every read-back. */
export function nameCarriesMarker(name: string | null | undefined, marker: string): boolean {
  return typeof name === "string" && name.includes(`[${marker}]`);
}
