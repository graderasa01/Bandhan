import { IS_MOCK } from "../config";
import { mockProvider } from "./mockProvider";
import { serverProvider } from "./serverProvider";
import type { AiProvider } from "./types";

export * from "./types";

/**
 * The provider the app uses. One line to change if the AI ever moves (an
 * on-device model, a different backend) — see `types.ts` for the contract.
 */
export const ai: AiProvider = IS_MOCK ? mockProvider : serverProvider;
