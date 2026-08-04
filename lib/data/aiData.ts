import { getDataMode } from "./dataMode";
import type { AIDrawerViewModel, AIActionViewModel, AIMessageViewModel, AIRoleContext } from "@/lib/contracts/ai";
import { mockAIDrawerData } from "@/lib/mock/aiMock";

export async function getAIDrawerData(roleContext: AIRoleContext, currentPageLabel: string): Promise<AIDrawerViewModel> {
  if (getDataMode() === "mock") {
    const data = { ...mockAIDrawerData };
    data.roleContext = roleContext;
    data.currentPageLabel = currentPageLabel;
    if (roleContext === "PARTNER") {
      data.greeting = "Namaste! Main aapki partner dashboard me help kar sakta hu.";
      data.messages = [{ id: "ai-p1", sender: "ai", text: "Namaste! Aap abhi 24 leads track kar rahe hain. Kya aap referral tips chahte hain?" }];
      data.quickActions = [{ id: "referral-tips", label: "Referral Tips Dekhein", description: "Better referral ke tips", riskLevel: "SAFE_NAVIGATION", requiresConfirmation: false }];
    }
    if (roleContext === "ADMIN") {
      data.greeting = "Admin panel me welcome hai.";
      data.currentPageLabel = currentPageLabel;
      data.messages = [{ id: "ai-a1", sender: "ai", text: "Abhi 12 pending partners aur 56 pending commissions hain. Review karna chahenge?" }];
      data.quickActions = [{ id: "review-pending", label: "Pending Reviews Dekhein", description: "Pending partners and commissions", riskLevel: "MEDIUM_RISK_ACTION", requiresConfirmation: true }];
    }
    if (roleContext === "PUBLIC") {
      data.greeting = "Namaste! BandhanTak me welcome hai.";
      data.messages = [{ id: "ai-pub1", sender: "ai", text: "Kya aap profile banana chahte hain ya partner program explore karna chahte hain?" }];
      data.quickActions = [{ id: "register", label: "Free Profile Banayein", description: "AI-guided registration", riskLevel: "SAFE_NAVIGATION", requiresConfirmation: false, href: "/register" }];
    }
    return data;
  }
  throw new Error("API data mode is not implemented during M01 UI phase.");
}

export async function getAIQuickActions(roleContext: AIRoleContext, currentPageLabel: string): Promise<AIActionViewModel[]> {
  const data = await getAIDrawerData(roleContext, currentPageLabel);
  return data.quickActions;
}

export async function getAIMockResponseForMessage(message: string): Promise<AIMessageViewModel> {
  void message; // used in future API mode
  if (getDataMode() === "mock") {
    return { id: `ai-resp-${Date.now()}`, sender: "ai", text: "Main aapki query samajh raha hu. Abhi M01 phase me main demo responses de raha hu. Backend AI integration M05/M06 me implement hoga." };
  }
  throw new Error("API data mode is not implemented during M01 UI phase.");
}
