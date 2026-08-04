import { getDataMode } from "./dataMode";
import type { AdminDashboardViewModel } from "@/lib/contracts/admin";
import { mockAdminDashboardData } from "@/lib/mock/adminMock";

export async function getAdminDashboardData(): Promise<AdminDashboardViewModel> {
  if (getDataMode() === "mock") return mockAdminDashboardData;
  throw new Error("API data mode is not implemented during M01 UI phase.");
}
