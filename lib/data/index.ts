export { getDataMode } from "./dataMode";
export type { DataMode } from "./dataMode";
export * from "./publicPageData";
export * from "./userDashboardData";
// profileSetupData removed — the wizard it fed (ProfileSetupView) was
// superseded by the voice interview (components/profile/InterviewMode.tsx).
export * from "./discoveryData";
export * from "./subscriptionData";
// Plan pricing + commission rate are real Prisma now (lib/data/planData.ts) —
// same graduation as partnerData.ts, no planMock.ts needed.
export * from "./planData";
export * from "./partnerData";
export * from "./adminData";
export * from "./aiData";
