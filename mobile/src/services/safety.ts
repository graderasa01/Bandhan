import { IS_MOCK } from "./config";
import { api } from "./api/client";
import { delay } from "~/mocks/mockDb";

/**
 * Report and block — `/api/safety`, one request for both so there is never a
 * window where somebody has been reported but can still message. Reporting
 * blocks by default, as on the web.
 */
export interface ReportInput {
  profileId?: string;
  userId?: string;
  reason: string;
  details?: string;
  alsoBlock?: boolean;
  targetType?: "PROFILE" | "MESSAGE";
  targetId?: string;
}

export const safetyService = {
  async report(input: ReportInput): Promise<void> {
    if (IS_MOCK) return delay(400);
    await api("/api/safety", { body: { action: "report", alsoBlock: true, ...input } });
  },
  async block(target: { profileId?: string; userId?: string }): Promise<void> {
    if (IS_MOCK) return delay(300);
    await api("/api/safety", { body: { action: "block", ...target } });
  },
};
