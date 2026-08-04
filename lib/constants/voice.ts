/**
 * Voice-note limits, shared by the recorder and the upload route.
 *
 * Lives here rather than in either of them because a Next route module may
 * only export handlers and framework config — exporting a constant from
 * `app/api/media/voice/route.ts` is a build error. And the recorder must not
 * own the number either: the client's cap is a courtesy, the server's is the
 * rule, and they have to be the same rule.
 */

/** The product promise: ten seconds. */
export const VOICE_MAX_SECONDS = 10;

/**
 * What the server actually accepts.
 *
 * Three seconds of slack because MediaRecorder stops on a timer and the final
 * chunk lands a beat later — a hard 10,000 would reject perfectly valid
 * recordings on slow devices, and "your 10-second clip was 10.2 seconds" is an
 * absurd thing to tell someone.
 */
export const VOICE_MAX_MS = 13_000;

/** ~10s of Opus is under 25KB. Generous enough never to bite a real clip. */
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;
