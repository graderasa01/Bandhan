/**
 * MicGate behaviour, without a browser: synthetic capture blocks through the
 * same class `GrioLiveSession` uses while Grio is speaking.
 *
 *   npx tsx scripts/bolo-mic-gate-check.ts
 *
 * Each scenario is one thing a phone actually does: the residual echo of
 * Grio's own voice, a door slam, a visitor talking over her, and the quiet
 * pass-through when she is silent.
 */

import { MIC_GATE, MicGate, blockRms } from "../lib/bolo/micGate";

const BLOCK = 4096;

/** A block of white noise at a given RMS — loudness is all the gate reads. */
function noise(rms: number): Float32Array {
  const out = new Float32Array(BLOCK);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) {
    const v = Math.random() * 2 - 1;
    out[i] = v;
    sum += v * v;
  }
  const scale = rms / Math.sqrt(sum / BLOCK);
  for (let i = 0; i < BLOCK; i++) out[i] *= scale;
  return out;
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Push N blocks at one loudness; returns the gains actually emitted. */
function run(gate: MicGate, rms: number, blocks: number, shielded: boolean): number[] {
  const gains: number[] = [];
  for (let i = 0; i < blocks; i++) {
    const b = noise(rms);
    for (const out of gate.push(b, blockRms(b), shielded)) gains.push(out.gain);
  }
  return gains;
}

/* 1. Grio silent: everything passes at full gain, nothing held. */
{
  const gate = new MicGate();
  const gains = run(gate, 0.01, 10, false);
  check("unshielded: every block emitted at gain 1", gains.length === 10 && gains.every((g) => g === 1));
  check("unshielded: floor learned the room", Math.abs(gate.noiseFloor - 0.01) < 0.004, `floor=${gate.noiseFloor.toFixed(4)}`);
}

/* 2. Residual echo while Grio speaks: attenuated, never opens. */
{
  const gate = new MicGate();
  run(gate, 0.008, 20, false); // a quiet room first
  const gains = run(gate, 0.02, 30, true); // echo at 0.02 — audible, below minLoudRms
  check("echo (0.02) under shield: nothing at full gain", gains.every((g) => g === MIC_GATE.closedGain), `emitted=${gains.length}`);
  check("echo: gate stayed closed", !gate.isOpen);
  check("echo: lookahead holds back exactly the last blocks", gains.length === 30 - MIC_GATE.lookaheadBlocks);
}

/* 3. Louder echo (above minLoudRms): opens once, is caught by the open-too-long rule, then stays closed — this turn and the next. */
{
  const gate = new MicGate();
  run(gate, 0.01, 20, false);
  const gains = run(gate, 0.035, 40, true);
  check("echo (0.035): opened at first (it is louder than anything learned)", gains.some((g) => g === 1));
  check("echo (0.035): closed again by the open-too-long rule", !gate.isOpen);
  check("echo (0.035): remembered as the echo floor", gate.echoFloor > 0.02, `echoFloor=${gate.echoFloor.toFixed(4)}`);
  const tail = gains.slice(-8);
  check("echo (0.035): the tail of this line is attenuated", tail.every((g) => g === MIC_GATE.closedGain));

  // Grio pauses briefly, then the next line — the echo must not open the gate at all now.
  run(gate, 0.01, 12, false);
  const next = run(gate, 0.035, 30, true);
  check("echo (0.035): next line attenuated from the first block", next.every((g) => g === MIC_GATE.closedGain) && !gate.isOpen, `echoFloor=${gate.echoFloor.toFixed(4)}`);

  // ...and a visitor who really talks over her still gets through.
  const speech = run(gate, 0.12, 4, true);
  check("echo (0.035): a real barge-in (0.12) still opens the gate", gate.isOpen && speech.some((g) => g === 1));
}

/* 4. A single bang (one loud block) does not open the gate. */
{
  const gate = new MicGate();
  run(gate, 0.01, 20, false);
  run(gate, 0.015, 10, true);
  const bang = noise(0.3);
  const out = gate.push(bang, blockRms(bang), true);
  check("door slam: one loud block opens nothing", !gate.isOpen && out.every((o) => o.gain === MIC_GATE.closedGain));
  const after = run(gate, 0.015, 5, true);
  check("door slam: gate still closed afterwards", !gate.isOpen && after.every((g) => g === MIC_GATE.closedGain));
}

/* 5. The visitor talks over Grio: opens after the attack, and the held onset goes out at full gain. */
{
  const gate = new MicGate();
  run(gate, 0.01, 20, false);
  run(gate, 0.015, 10, true);
  const emitted: number[] = [];
  const speech = [0.12, 0.15, 0.1, 0.13, 0.11];
  for (const rms of speech) {
    const b = noise(rms);
    for (const o of gate.push(b, blockRms(b), true)) emitted.push(o.gain);
  }
  check("barge-in: gate opens", gate.isOpen);
  const firstFull = emitted.indexOf(1);
  check("barge-in: held blocks released at full gain when it opens", firstFull >= 0 && emitted.slice(firstFull).every((g) => g === 1), `gains=${emitted.join(",")}`);
  // The release carries lookahead + the block that opened it in one go.
  const releaseBurst = emitted.filter((g) => g === 1).length;
  check("barge-in: onset (lookahead) not lost", releaseBurst >= MIC_GATE.lookaheadBlocks + 1, `fullGainBlocks=${releaseBurst}`);

  // Then silence: the hold keeps it open for a while, then it closes again.
  const quiet = run(gate, 0.012, MIC_GATE.holdBlocks + 3, true);
  check("barge-in: closes again after the hold", !gate.isOpen);
  check("barge-in: the hold blocks went out at full gain", quiet.slice(0, MIC_GATE.holdBlocks - 1).every((g) => g === 1));
}

/* 6. Long speech does not drag the floor up behind it. */
{
  const gate = new MicGate();
  run(gate, 0.01, 20, false);
  const before = gate.noiseFloor;
  run(gate, 0.15, 120, false); // ~10 s of talking
  check("floor: barely moves during a long answer", gate.noiseFloor < before * 1.6, `before=${before.toFixed(4)} after=${gate.noiseFloor.toFixed(4)}`);
}

/* 7. Shield ends mid-hold: held blocks drain immediately at full gain. */
{
  const gate = new MicGate();
  run(gate, 0.01, 5, true); // two blocks now held back
  const b = noise(0.01);
  const out = gate.push(b, blockRms(b), false);
  check("shield off: ring drains plus the current block, all full gain", out.length === MIC_GATE.lookaheadBlocks + 1 && out.every((o) => o.gain === 1));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
