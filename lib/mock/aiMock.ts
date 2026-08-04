import type { AIDrawerViewModel, AIMessageViewModel, AIActionViewModel } from "@/lib/contracts/ai";

export const mockAIDrawerData: AIDrawerViewModel = {
  roleContext: "USER",
  currentPageLabel: "Dashboard",
  greeting: "Namaste! Main aapki profile complete karne me help kar sakta hu.",
  messages: [
    { id: "ai-msg-1", sender: "ai", text: "Namaste! Main aapki BandhanTak profile complete karne me help kar sakta hu. Kya aap chahte hain ki main missing details identify karu?" },
    { id: "ai-msg-2", sender: "user", text: "Haan, meri missing details batao." },
    { id: "ai-msg-3", sender: "ai", text: "Abhi aapki height, current city aur family details missing hain. Sabse pehle aapki height kya hai?" },
  ],
  quickActions: [
    { id: "complete-profile", label: "Profile Complete Karwa Do", description: "AI aapki missing details puchhega", riskLevel: "SAFE_NAVIGATION", requiresConfirmation: false, icon: "✨" },
    { id: "upload-biodata", label: "Biodata Upload Karein", description: "Biodata se auto-fill", riskLevel: "LOW_RISK_UPDATE", requiresConfirmation: false, icon: "📄" },
    { id: "missing-fields", label: "Missing Fields Dekhein", description: "Kya kya add karna baki hai", riskLevel: "SAFE_NAVIGATION", requiresConfirmation: false, icon: "📋" },
  ],
  missingFields: [
    { fieldKey: "height", label: "Height", whyNeeded: "Better matches ke liye height add karein" },
    { fieldKey: "city", label: "Current City", whyNeeded: "Location-based matches ke liye city zaroori hai" },
    { fieldKey: "partner_preference", label: "Partner Preference", whyNeeded: "Suitable partner suggestions ke liye preference batayein" },
  ],
  confirmation: null,
  insights: [
    { id: "ins-1", tone: "info", title: "Profile Progress", message: "Aapki profile 72% complete hai. Better matches ke liye photo aur family details add karein.", ctaLabel: "AI se Complete Karein", ctaActionId: "complete-profile" },
    { id: "ins-2", tone: "warning", title: "Missing Fields", message: "3 important fields missing hain. Inhe complete karne se match quality improve hogi." },
  ],
};

export const mockAIMessages: AIMessageViewModel[] = mockAIDrawerData.messages;
export const mockAIQuickActions: AIActionViewModel[] = mockAIDrawerData.quickActions;

// Legacy compat
export const MOCK_AI_MESSAGES = [
  { role: "ai" as const, text: "Namaste! Main aapki BandhanTak profile complete karne me help kar sakta hu." },
  { role: "ai" as const, text: "Aapki profile 72% complete hai. Better matches ke liye photo aur family details add karein." },
];

export const MOCK_AI_QUICK_ACTIONS = [
  { id: "complete-profile", label: "Profile Complete Karwa Do", page: "profile-setup" },
  { id: "upload-biodata", label: "Biodata Upload Karein", page: "profile-setup" },
  { id: "show-matches", label: "Matches Dekhein", page: "matches" },
];

export const MOCK_EXTRACTED_FIELDS = [
  { fieldName: "Full Name", extractedValue: "Demo Person X", confidence: "high" as const, sourceType: "PDF" },
  { fieldName: "Date of Birth", extractedValue: "Demo Date", confidence: "medium" as const, sourceType: "PDF" },
  { fieldName: "Education", extractedValue: "B.Tech", confidence: "high" as const, sourceType: "PDF" },
  { fieldName: "Profession", extractedValue: "Demo Profession", confidence: "high" as const, sourceType: "PDF" },
  { fieldName: "City", extractedValue: "Demo City", confidence: "low" as const, sourceType: "PDF" },
];
