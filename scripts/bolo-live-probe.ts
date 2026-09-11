import "./_env";

/**
 * Grio's live socket, minus the microphone: the exact setup the browser
 * sends (`boloLiveConfig`, including the activity-detection tuning) through
 * a token minted the way `/api/bolo/live-token` mints it, to the constrained
 * endpoint — and one text turn to prove the session answers.
 *
 * Run: `npx tsx scripts/bolo-live-probe.ts`
 * (needs `GEMINI_API_KEY` in .env, and Node 20 gets `WebSocket` from
 * `--experimental-websocket`, which this script sets for itself).
 *
 * Why this exists: a field name Gemini does not know is a 400 at mint time,
 * and a value it does not accept is a socket that never reaches
 * `setupComplete`. Both are invisible until a real phone tries — this makes
 * them a 20-second check. Costs one short audio turn.
 */

import { BOLO_LIVE_MODEL, boloLiveConfig } from "../lib/bolo/agent";

const ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const config = boloLiveConfig("Kore");
  const setup = {
    model: `models/${BOLO_LIVE_MODEL}`,
    generationConfig: {
      responseModalities: config.responseModalities,
      temperature: config.temperature,
      speechConfig: config.speechConfig,
    },
    systemInstruction: config.systemInstruction,
    tools: config.tools,
    realtimeInputConfig: config.realtimeInputConfig,
    inputAudioTranscription: config.inputAudioTranscription,
    outputAudioTranscription: config.outputAudioTranscription,
  };

  const now = Date.now();
  const mint = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 5 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      bidiGenerateContentSetup: setup,
    }),
  });
  if (!mint.ok) throw new Error(`mint ${mint.status}: ${(await mint.text()).slice(0, 300)}`);
  const { name: token } = (await mint.json()) as { name: string };
  console.log("mint ok — locked setup includes realtimeInputConfig:", JSON.stringify(config.realtimeInputConfig));

  const WS = (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!WS) throw new Error("no WebSocket global — run under node --experimental-websocket");

  await new Promise<void>((resolve, reject) => {
    const socket = new WS(`${ENDPOINT}?access_token=${encodeURIComponent(token)}`);
    const timer = setTimeout(() => reject(new Error("timeout: no turnComplete in 25 s")), 25_000);
    let audioChunks = 0;
    let said = "";
    socket.onopen = () => socket.send(JSON.stringify({ setup }));
    socket.onmessage = async (event) => {
      const raw = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
      const msg = JSON.parse(raw) as {
        setupComplete?: unknown;
        serverContent?: {
          modelTurn?: { parts?: Array<{ inlineData?: unknown }> };
          outputTranscription?: { text?: string };
          turnComplete?: boolean;
        };
        error?: unknown;
      };
      if (msg.setupComplete !== undefined) {
        console.log("setupComplete — the constrained endpoint accepted the setup");
        socket.send(JSON.stringify({ realtimeInput: { text: "[Session shuru. Sirf Namaste bolo, ek shabd.]" } }));
        return;
      }
      if (msg.error) {
        clearTimeout(timer);
        reject(new Error(`server error: ${JSON.stringify(msg.error)}`));
        return;
      }
      const content = msg.serverContent;
      if (!content) return;
      audioChunks += content.modelTurn?.parts?.filter((p) => p.inlineData).length ?? 0;
      if (content.outputTranscription?.text) said += content.outputTranscription.text;
      if (content.turnComplete) {
        clearTimeout(timer);
        console.log(`turnComplete — ${audioChunks} audio chunks, Grio said: ${JSON.stringify(said.trim())}`);
        socket.close();
        resolve();
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error("socket error"));
    };
    socket.onclose = (event) => {
      clearTimeout(timer);
      if (event.code !== 1000 && event.code !== 1005) reject(new Error(`socket closed ${event.code} ${event.reason}`));
    };
  });
  console.log("PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
