import { getDataMode } from "./dataMode";
import type { AIDrawerViewModel, AIActionViewModel, AIMessageViewModel, AIRoleContext } from "@/lib/contracts/ai";
import { mockAIDrawerData } from "@/lib/mock/aiMock";
import { noopT, type Translate } from "@/lib/i18n/translate";

export async function getAIDrawerData(
  roleContext: AIRoleContext,
  currentPageLabel: string,
  t: Translate = noopT,
): Promise<AIDrawerViewModel> {
  if (getDataMode() === "mock") {
    const data = { ...mockAIDrawerData };
    data.roleContext = roleContext;
    data.currentPageLabel = currentPageLabel;
    if (roleContext === "PARTNER") {
      data.greeting = t("profileServices.ai.partner.greeting", "Namaste! Main aapki partner dashboard me help kar sakta hu.");
      data.messages = [
        {
          id: "ai-p1",
          sender: "ai",
          text: t(
            "profileServices.ai.partner.message",
            "Namaste! Aap abhi 24 leads track kar rahe hain. Kya aap referral tips chahte hain?",
          ),
        },
      ];
      data.quickActions = [
        {
          id: "referral-tips",
          label: t("profileServices.ai.partner.action.label", "Referral Tips Dekhein"),
          description: t("profileServices.ai.partner.action.description", "Better referral ke tips"),
          riskLevel: "SAFE_NAVIGATION",
          requiresConfirmation: false,
        },
      ];
    }
    if (roleContext === "ADMIN") {
      data.greeting = t("profileServices.ai.admin.greeting", "Admin panel me welcome hai.");
      data.currentPageLabel = currentPageLabel;
      data.messages = [
        {
          id: "ai-a1",
          sender: "ai",
          text: t(
            "profileServices.ai.admin.message",
            "Abhi 12 pending partners aur 56 pending commissions hain. Review karna chahenge?",
          ),
        },
      ];
      data.quickActions = [
        {
          id: "review-pending",
          label: t("profileServices.ai.admin.action.label", "Pending Reviews Dekhein"),
          description: t("profileServices.ai.admin.action.description", "Pending partners and commissions"),
          riskLevel: "MEDIUM_RISK_ACTION",
          requiresConfirmation: true,
        },
      ];
    }
    if (roleContext === "PUBLIC") {
      data.greeting = t("profileServices.ai.public.greeting", "Namaste! BandhanTak me welcome hai.");
      data.messages = [
        {
          id: "ai-pub1",
          sender: "ai",
          text: t(
            "profileServices.ai.public.message",
            "Kya aap profile banana chahte hain ya partner program explore karna chahte hain?",
          ),
        },
      ];
      data.quickActions = [
        {
          id: "register",
          label: t("profileServices.ai.public.action.label", "Free Profile Banayein"),
          description: t("profileServices.ai.public.action.description", "AI-guided registration"),
          riskLevel: "SAFE_NAVIGATION",
          requiresConfirmation: false,
          href: "/register",
        },
      ];
    }
    return data;
  }
  throw new Error("API data mode is not implemented during M01 UI phase.");
}

export async function getAIQuickActions(
  roleContext: AIRoleContext,
  currentPageLabel: string,
  t: Translate = noopT,
): Promise<AIActionViewModel[]> {
  const data = await getAIDrawerData(roleContext, currentPageLabel, t);
  return data.quickActions;
}

export async function getAIMockResponseForMessage(message: string, t: Translate = noopT): Promise<AIMessageViewModel> {
  void message; // used in future API mode
  if (getDataMode() === "mock") {
    return {
      id: `ai-resp-${Date.now()}`,
      sender: "ai",
      text: t(
        "profileServices.ai.mockResponse",
        "Main aapki query samajh raha hu. Abhi M01 phase me main demo responses de raha hu. Backend AI integration M05/M06 me implement hoga.",
      ),
    };
  }
  throw new Error("API data mode is not implemented during M01 UI phase.");
}
