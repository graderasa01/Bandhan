// GENERATED from lib/bolo/micGate.ts by mobile/scripts/sync-catalog.ts — do not edit.
// The web file is the one source of truth: change it there, then run
// `npm run sync-catalog` in mobile/. `npm run check-catalog` fails on drift.

/**
 * A gate on the microphone for the moments Grio is talking.
 *
 * On a phone the loudspeaker sits a few centimetres from the mic. The
 * browser's echo canceller takes most of Grio's own voice back out of the
 * capture, but what it leaves is still *speech* — and Gemini's activity
 * detector, hearing speech while the model is mid-sentence, does exactly
 * what it is built to do: interrupts. The client drops the rest of the
 * line, the model answers its own echo, and the visitor sees Grio stop
 * mid-word and "get confused by background sound". The same path is open to
 * the TV, the traffic and the relative in the next chair.
 *
 * So while Grio's audio is playing (plus a short tail for the echo to die
 * down) the mic is *shielded*: capture blocks are still sent — the stream
 * must stay continuous or the server's own timing drifts — but at a gain
 * that leaves nothing for a detector to find, unless the block is clearly
 * louder than the learned floor for a couple of blocks running. Someone who
 * genuinely talks over Grio does exactly that; a residual echo or a door
 * slam does not. Barge-in stays possible, it just costs a real sentence.
 *
 * Three details keep the gate honest:
 *   - the ambient floor is learned from the *quiet* blocks only (with a slow
 *     leak upward so it can never wedge low), so a long answer does not drag
 *     the threshold up behind it;
 *   - closed blocks are held back for a beat before they go out, and the
 *     moment the gate opens the held blocks go out at full gain — the first
 *     syllable of a barge-in is what opened the gate, and it must not be the
 *     part that gets lost;
 *   - an echo loud enough to open the gate is caught by what happens next:
 *     real speech through an open gate makes Gemini interrupt within about a
 *     second, and an interruption ends the shield. A gate still open under
 *     shield after `maxOpenBlocks` therefore heard something the server did
 *     not take for speech — it closes, and that level is remembered as the
 *     echo floor so the next line is protected from its first word. The
 *     memory fades while Grio is silent, so one coincidence never mutes a
 *     visitor for good.
 *
 * When Grio is silent nothing is held and nothing is attenuated: the
 * server's detector (tuned in `agent.ts`) is the judge of what is speech.
 *
 * Pure and frame-agnostic on purpose — `GrioLiveSession` decides what a
 * block is and when shielding applies; this only decides gain and timing —
 * so it can be exercised without a browser (`scripts/bolo-mic-gate-check.ts`).
 */

/** ~85 ms per block at the session's 4096-frame capture size and a 48 kHz device rate. */
export const MIC_GATE = {
  /** Loud blocks in a row before a shielded gate opens (~170 ms). */
  attackBlocks: 2,
  /** Blocks after the last loud one before an open gate closes again (~600 ms). */
  holdBlocks: 7,
  /** Blocks held back while closed, released at full gain when the gate opens. */
  lookaheadBlocks: 2,
  /** An open gate the server has not answered with an interruption after this long (~2 s) was hearing echo, not speech. */
  maxOpenBlocks: 24,
  /** Absolute RMS a block must exceed to count as loud while shielded — normal speech into a phone is 0.05-0.2. */
  minLoudRms: 0.03,
  /** ...and it must also be this many times the floor. */
  loudRatio: 3,
  /** Gain on a closed block: -34 dB. The stream keeps flowing; the echo does not reach the detector. */
  closedGain: 0.02,
  /** How fast the ambient floor follows a quiet block. */
  floorAlpha: 0.1,
  /** Per-block upward creep under sustained loudness, so a floor learned in a lull recovers. */
  floorLeak: 0.003,
  /** The remembered echo level, as a fraction of what was heard through the wrongly open gate: a visitor twice as loud as the echo still gets through. */
  echoMargin: 1.5,
  /** Per-block decay of the remembered echo level while Grio is silent (about half in 12 s). */
  echoDecay: 0.995,
  /** Starting floor before anything has been heard. */
  initialFloor: 0.005,
} as const;

export type GatedBlock = { block: Float32Array; gain: number };

export class MicGate {
  private ambient: number = MIC_GATE.initialFloor;
  private echo = 0;
  private loudRun = 0;
  private hold = 0;
  private open = false;
  private openBlocks = 0;
  private openLevel = 0;
  private ring: Float32Array[] = [];

  /** The learned quiet level — exposed for diagnostics and tests. */
  get noiseFloor(): number {
    return Math.max(this.ambient, this.echo);
  }

  /** The remembered residual-echo level, 0 until an echo has been caught. */
  get echoFloor(): number {
    return this.echo;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Feed one capture block. Returns the blocks to send *now*, in order, each
   * with the gain to apply — possibly none (held back), possibly several
   * (a release).
   *
   * @param shielded whether Grio's audio is playing right now (or just was).
   */
  push(block: Float32Array, rms: number, shielded: boolean): GatedBlock[] {
    const loud = rms > Math.max(MIC_GATE.minLoudRms, this.noiseFloor * MIC_GATE.loudRatio);
    this.learn(rms, loud);

    if (!shielded) {
      // Nothing to protect: release anything held and pass straight through.
      this.echo *= MIC_GATE.echoDecay;
      this.close();
      return this.releaseHeld(block);
    }

    this.loudRun = loud ? this.loudRun + 1 : 0;

    if (this.open) {
      this.openBlocks++;
      this.openLevel += (rms - this.openLevel) * 0.2;
      if (this.openBlocks > MIC_GATE.maxOpenBlocks) {
        // Still playing, still "loud", never interrupted: that was the echo.
        this.echo = Math.max(this.echo, this.openLevel / MIC_GATE.echoMargin);
        this.close();
        this.ring.push(block);
        return [];
      }
      if (loud) this.hold = MIC_GATE.holdBlocks;
      else if (--this.hold <= 0) this.close();
      return [{ block, gain: 1 }];
    }

    if (this.loudRun >= MIC_GATE.attackBlocks) {
      this.open = true;
      this.hold = MIC_GATE.holdBlocks;
      this.openBlocks = 0;
      this.openLevel = rms;
      return this.releaseHeld(block);
    }

    this.ring.push(block);
    if (this.ring.length > MIC_GATE.lookaheadBlocks) {
      const oldest = this.ring.shift() as Float32Array;
      return [{ block: oldest, gain: MIC_GATE.closedGain }];
    }
    return [];
  }

  /** Forget everything held back (session end). */
  reset() {
    this.ring = [];
    this.close();
  }

  private close() {
    this.open = false;
    this.loudRun = 0;
    this.hold = 0;
    this.openBlocks = 0;
  }

  private releaseHeld(current: Float32Array): GatedBlock[] {
    const out = this.ring.map((block) => ({ block, gain: 1 }));
    this.ring = [];
    out.push({ block: current, gain: 1 });
    return out;
  }

  private learn(rms: number, loud: boolean) {
    if (loud) this.ambient += this.ambient * MIC_GATE.floorLeak;
    else this.ambient += (rms - this.ambient) * MIC_GATE.floorAlpha;
    if (this.ambient < 1e-4) this.ambient = 1e-4;
  }
}

/** Root-mean-square of a block — the one loudness measure the gate reasons in. */
export function blockRms(block: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
  return Math.sqrt(sum / Math.max(1, block.length));
}
