import "server-only";

/**
 * Gemini as a speech vendor — the second option behind `resolveVoiceRoute`.
 *
 * ## Raw `fetch`, not `@google/generative-ai`
 *
 * Every other Gemini call in this app goes through the SDK
 * (`lib/ai/providers/gemini.ts`) and should keep doing so. These two do not,
 * for reasons that are specific rather than stylistic:
 *
 *  - **TTS needs `responseModalities: ["AUDIO"]` and `speechConfig`**, which the
 *    pinned SDK's typed `generationConfig` has no room for. Casting around its
 *    types to reach fields it does not model is strictly worse than writing the
 *    request the docs describe.
 *  - **STT must switch thinking off** (`thinkingBudget: 0`). On a 2.5-series
 *    model reasoning is drawn from the same output ceiling as the answer, and a
 *    transcription request that spends its budget deliberating returns an empty
 *    string — the exact failure `AiCallParams.thinking` was added to stop on the
 *    Anthropic side. There is nothing to think about here: the audio either says
 *    words or it doesn't.
 *
 * The Sarvam halves of these two routes are also plain `fetch` calls, so this
 * keeps both vendors written the same way inside the same file.
 *
 * ## Cost shape, worth knowing before switching a live deployment
 *
 * Gemini bills speech per *token*, and audio tokenises at roughly 32 tokens per
 * second in and 25 per second out — so a spoken turn is not the flat per-minute
 * line Sarvam invoices. Neither vendor is dramatically cheaper than the other at
 * the volumes this app sees; pick on how the Hinglish actually sounds.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Shared by both calls: a non-2xx from Google is worth reading before dropping. */
async function postGemini(
  model: string,
  apiKey: string,
  body: unknown,
  tag: string,
): Promise<unknown | null> {
  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    // Header rather than `?key=` — a key in a query string ends up in Google's
    // access logs and in any proxy between here and there.
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[speech:${tag}] gemini failed:`, res.status, await res.text().catch(() => ""));
    return null;
  }
  return res.json();
}

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] };
  }[];
};

/**
 * Audio in, transcript out.
 *
 * `locale` is passed as a hint rather than a setting — Gemini has no
 * language-code parameter for this, it reads what it hears. The hint still
 * earns its place: it is the difference between a Marathi sentence coming back
 * as Marathi and coming back as confident Hindi-shaped nonsense, which is the
 * same failure `SpeechProvider.locale` exists to prevent on the Sarvam path.
 */
export async function geminiTranscribe(params: {
  apiKey: string;
  model: string;
  audio: ArrayBuffer;
  mimeType: string;
  locale: string;
}): Promise<string | null> {
  const json = (await postGemini(
    params.model,
    params.apiKey,
    {
      systemInstruction: {
        parts: [
          {
            // Every clause here is load-bearing. Without "sirf transcript", a
            // chat model asked about audio answers *about* the audio ("The
            // speaker says they are 28 and live in Pune") instead of
            // transcribing it, and the extraction downstream then reads a
            // summary as if it were the user's own words.
            text:
              "Aap ek transcription engine hain. Aapko ek audio clip milegi. " +
              "Sirf usme bole gaye shabd wapas kijiye — koi summary nahi, koi explanation nahi, " +
              "koi speaker label nahi, koi timestamp nahi, quotes bhi nahi. " +
              "Hinglish ho to Hinglish hi likhiye (Latin script), Devanagari me mat badliye. " +
              "Agar clip me koi saaf shabd nahi hai to bilkul khaali jawab dijiye.",
          },
        ],
      },
      contents: [
        {
          parts: [
            { text: `Is clip ki bhasha lagbhag "${params.locale}" hai. Ise transcribe kijiye.` },
            {
              inline_data: {
                mime_type: params.mimeType,
                data: Buffer.from(params.audio).toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        // Transcription is not a creative task; sampling only invents words.
        temperature: 0,
        maxOutputTokens: 1024,
        // See the header note — without this the whole budget can go to
        // reasoning and the transcript comes back empty.
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    "stt",
  )) as GeminiResponse | null;

  if (!json) return null;
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return text.trim();
}

/**
 * Text in, WAV out.
 *
 * Gemini answers with *raw* PCM — 16-bit signed little-endian, mono, 24kHz,
 * announced as `audio/L16;codec=pcm;rate=24000` — and no container. A browser
 * `Audio` element will not play headerless PCM, so the RIFF header is written
 * here rather than shipped to the client: `/api/speech/tts` promises `audio/wav`
 * to a caller that has no idea which vendor answered, and that promise is the
 * only reason `SarvamSpeechOutputProvider` can stay vendor-blind.
 */
export async function geminiSynthesize(params: {
  apiKey: string;
  model: string;
  text: string;
  voice: string;
  // `<ArrayBuffer>` rather than the default `<ArrayBufferLike>`: only the
  // former is assignable to `BodyInit`, so widening it here would push a cast
  // into every route that streams this back.
}): Promise<Uint8Array<ArrayBuffer> | null> {
  const json = (await postGemini(
    params.model,
    params.apiKey,
    {
      contents: [{ parts: [{ text: params.text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: params.voice } } },
      },
    },
    "tts",
  )) as GeminiResponse | null;

  if (!json) return null;
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const data = part?.inlineData?.data;
  if (!data) {
    console.error("[speech:tts] gemini returned no audio part");
    return null;
  }

  // Read the rate Google actually announced rather than assuming 24000: it
  // rides in the mime type (`audio/L16;codec=pcm;rate=24000`), and a header
  // that disagrees with the samples plays back at the wrong pitch — a bug that
  // sounds like a bad voice rather than a wrong number.
  const rate = Number(/rate=(\d+)/.exec(part?.inlineData?.mimeType ?? "")?.[1]) || 24_000;
  return wrapPcmAsWav(Buffer.from(data, "base64"), rate);
}

/**
 * 16-bit mono PCM → a .wav a browser will play. Mirrors `audioEncode.ts`'s
 * writer, which does the same job in the other direction on the client.
 *
 * Returns a plain `Uint8Array` rather than a `Buffer`: `Buffer`'s
 * `ArrayBufferLike` backing store is not assignable to `BodyInit`, so a
 * `NextResponse` built from one does not typecheck.
 */
function wrapPcmAsWav(pcm: Uint8Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, pcm.length, true);

  out.set(pcm, 44);
  return out;
}
