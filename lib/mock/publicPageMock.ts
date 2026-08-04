import type { HomePageViewModel, HowItWorksViewModel, PricingPageViewModel, PartnerProgramViewModel, SafetyPageViewModel, LoginPageViewModel, RegisterPageViewModel, PartnerRegisterViewModel, PartnerPendingViewModel } from "@/lib/contracts/publicPages";
import { makeMockMeta } from "@/lib/contracts/common";

export const mockHomePageData: HomePageViewModel = {
  meta: { pageTitle: "BandhanTak", pageDescription: "AI Powered Verified Matrimony & Partner Income Network", mockMeta: makeMockMeta() },
  hero: {
    headline: "BandhanTak — AI Powered Verified Matrimony",
    subheadline: "Verified profile, AI help aur safe partner network ke saath matrimony journey simple banayein.",
    primaryCTA: { label: "Free Profile Banayein", href: "/register" },
    secondaryCTA: { label: "Partner Banein", href: "/partner-program" },
  },
  howItWorks: [
    { step: 1, title: "Profile Banayein", description: "Manual, AI chat ya biodata upload se apni profile shuru karein." },
    { step: 2, title: "AI Help Lein", description: "AI missing details puchhega, draft banayega aur improve karega." },
    { step: 3, title: "Review & Submit", description: "Details confirm karein, photo upload karein, profile complete karein." },
    { step: 4, title: "Better Matches Payein", description: "Verified profiles ke saath smart matching, trust score ke saath." },
  ],
  trustCards: [
    { title: "AI Verified Profiles", description: "AI user ke diye hue data ke basis par help karta hai. Fake data invent nahi karta." },
    { title: "Privacy First", description: "Aapka data safe hai. Partner sirf apne referred users ka limited status dekhta hai." },
    { title: "Partner Trusted", description: "Har partner admin approval ke baad activate hota hai. Referral system transparent hai." },
    { title: "Safe & Secure", description: "Payment safe, commission ledger clear, privacy boundary strong." },
  ],
  aiProfileBuilder: {
    headline: "AI Aapki Profile Complete Karne Me Help Karega",
    description: "AI smart Hinglish questions puchhega, aapke answers se details fill karega. Biodata upload bhi kar sakte hain.",
    methods: [
      { title: "AI Chat Se Profile Banayein", description: "AI aapke saath baatcheet karega aur details fill karega. Simple aur guided.", icon: "chat" },
      { title: "Biodata Upload Karein", description: "Apna biodata image ya PDF upload karein. AI details auto-fill karega.", icon: "upload" },
      { title: "Manually Fill Karein", description: "Step-by-step form bhar kar apni profile khud complete karein.", icon: "form" },
    ],
    cta: { label: "AI se Profile Banayein", href: "/register" },
  },
  biodataAutofill: {
    headline: "Biodata Autofill — Time Bachayein",
    description: "Apna biodata image/PDF upload karein. AI details auto-fill karega. Aap sirf review karein aur confirm karein. Save time, get accurate profile.",
    cta: { label: "Biodata Upload Karein", href: "/register" },
  },
  verifiedProfile: {
    headline: "Verified Profiles — AI Guided, Not Fake",
    description: "AI user ke diye hue data ke basis par help karta hai. AI missing data invent nahi karta. Trust score profile completion aur verification se improve hota hai.",
    points: [
      "AI sirf aapke provide kiye hue details use karta hai",
      "Partner referred profiles me extra trust indicator hota hai",
      "Har profile verification process se guzar sakti hai",
    ],
  },
  partnerPreview: {
    headline: "BandhanTak Partner Banein — Refer Karein, Commission Earn Karein",
    description: "Pandit Ji, Marriage Bureau, Rishta Consultant, ya Community Coordinator? Members refer karein, unki subscription me discount dilayein, aur commission earn karein.",
    benefits: [
      { title: "Referral Link & QR", description: "Apna unique referral link aur QR code share karein." },
      { title: "Lead Dashboard", description: "Apne referred users ka status track karein." },
      { title: "Lifetime Commission", description: "₹100 har renewal par — jab tak aapka refer kiya user chalta rahe." },
    ],
    cta: { label: "Partner Registration →", href: "/partner-program" },
  },
  // Always overwritten by lib/data/planData.ts's getPlanPreviews() — pricing
  // is real Prisma now (D-10 monthly, D-11 ladder, D-13 partner offer), and a
  // second hardcoded copy here is just a copy waiting to go stale.
  pricingPreview: [],
  safetyPreview: {
    headline: "Aapki Privacy Aur Safety Hamari Priority Hai",
    description: "BandhanTak par safety aur trust foundation hai.",
    points: ["AI user ke diye data ke basis par help karta hai. Missing data invent nahi karta.", "Partner sirf apne referred users ka limited status dekhta hai.", "Verified profiles, partner boundaries aur transparent system."],
  },
  finalCTA: {
    headline: "Apni Verified Marriage Profile Abhi Banayein",
    description: "AI guided, safe aur premium matrimony platform par verified profile banayein.",
    primaryCTA: { label: "Free Profile Banayein", href: "/register" },
    secondaryCTA: { label: "Kaise Kaam Karta Hai", href: "/how-it-works" },
  },
};

export const mockHowItWorksData: HowItWorksViewModel = {
  meta: { pageTitle: "Kaise Kaam Karta Hai — BandhanTak", pageDescription: "Step-by-step process", mockMeta: makeMockMeta() },
  hero: { headline: "5 Steps Me Matrimony Journey Start Karein", description: "AI guided, verified profiles aur partner network ke saath." },
  steps: [
    { step: 1, title: "Free Account Banayein", description: "Mobile ya email se register karein.", icon: "1" },
    { step: 2, title: "Profile Create Karein", description: "Manual, AI chat ya biodata upload se.", icon: "2" },
    { step: 3, title: "AI Help Lein", description: "AI missing details puchhega, bio improve karega.", icon: "3" },
    { step: 4, title: "Review & Submit", description: "AI suggested details review karein.", icon: "4" },
    { step: 5, title: "Matches Payein", description: "Verified matches. Partner discount ke saath.", icon: "5" },
  ],
  finalCTA: { label: "Free Account Banayein", href: "/register" },
};

export const mockPricingData: PricingPageViewModel = {
  meta: { pageTitle: "Pricing — BandhanTak", pageDescription: "Plans", mockMeta: makeMockMeta() },
  hero: { headline: "Simple, Transparent Pricing", description: "Partner referral se discount bhi available hai." },
  plans: mockHomePageData.pricingPreview,
  partnerDiscountNote: "Partner referral se register karne par eligible plans par discount apply ho sakta hai.",
  paymentSafetyNote: "Payment gateway secure hai. Card details store nahi hoti.",
  faq: [
    { q: "Payment safe hai?", a: "Haan, payment secure gateway ke through hota hai." },
    { q: "Plan upgrade kar sakte hain?", a: "Bilkul. Existing plan active rehte hue upgrade kar sakte hain." },
    { q: "Partner discount kaise milega?", a: "Verified partner ke referral link se register karein." },
    { q: "Free trial hai?", a: "Registration free hai. Messaging ke liye subscription leni hogi." },
  ],
  finalCTA: { label: "Plan Choose Karein", href: "/register" },
};

export const mockPartnerProgramData: PartnerProgramViewModel = {
  meta: { pageTitle: "Partner Program — BandhanTak", pageDescription: "Referral income", mockMeta: makeMockMeta() },
  hero: { headline: "BandhanTak Partner Banein — Refer Karein, Earn Karein", description: "Pandit Ji, Marriage Bureau, Rishta Consultant — genuine members refer karein aur commission earn karein.", cta: { label: "Partner Registration Start Karein", href: "/partner/register" } },
  whoCanBecome: {
    headline: "Kaun Ban Sakta Hai Partner?", description: "Trusted log jo genuine members refer kar sakte hain.",
    types: [
      { id: "pandit", title: "Pandit Ji", description: "Shaadi aur dharmik karyakram karane wale pandit ji." },
      { id: "bureau", title: "Marriage Bureau", description: "Chhote marriage bureau jo clients refer kar sakte hain." },
      { id: "consultant", title: "Rishta Consultant", description: "Independent rishta consultants." },
      { id: "coordinator", title: "Community Coordinator", description: "Samaj ya community coordinators." },
      { id: "family", title: "Family Reference Partner", description: "Families jo referrals de sakte hain." },
      { id: "vendor", title: "Wedding Vendor", description: "Wedding photographers, mehendi artists." },
      { id: "other", title: "Other", description: "Koi bhi trusted person." },
    ],
  },
  howItWorks: [
    { step: 1, title: "Register as Partner", description: "Free registration. Admin review karega." },
    { step: 2, title: "Get Approved", description: "Approval ke baad referral code milega." },
    { step: 3, title: "Get Referral Code", description: "Unique link aur QR code share karein." },
    { step: 4, title: "Share", description: "WhatsApp, SMS ya social media par share karein." },
    { step: 5, title: "Users Subscribe", description: "Referred users subscription lete hain." },
    { step: 6, title: "Earn Commission", description: "Admin verification ke baad commission approved." },
  ],
  benefits: [
    { title: "Referral Link & QR", description: "Unique link aur QR code share karein.", icon: "link" },
    { title: "Lead Dashboard", description: "Referred users ka status track karein.", icon: "dashboard" },
    { title: "Commission Tracking", description: "Har subscription par commission status clear.", icon: "commission" },
    { title: "AI Partner Coach", description: "AI follow-up priority batayega.", icon: "ai" },
    { title: "Payout Status", description: "Payout request status track karein.", icon: "payout" },
  ],
  commissionTransparency: {
    headline: "Commission Transparency", description: "System simple aur transparent hai.",
    // D-12 is locked: ₹100 FLAT on any plan, and D-80 makes it recurring on
    // every renewal. This card previously promised "₹350 per subscription",
    // which contradicted both that decision and the homepage's own copy.
    example: { plan: "Koi bhi plan", commission: "₹100 flat — har renewal par bhi" },
    notes: ["Commission successful payment ke baad pending me aati hai.", "Admin verification ke baad approved hoti hai.", "Payout admin approval ke baad update hoga."],
  },
  approvalProcess: {
    headline: "Approval Process", description: "Admin review ke baad approve hoti hai.",
    steps: ["Application submit karein.", "Admin 24-48 ghante me review karega.", "Approved hone par tools active."],
  },
  trustAndPrivacy: {
    headline: "Trust & Privacy",
    points: ["Partner admin approval ke baad activate hota hai.", "Partner sirf apne referred users ka limited status dekhta hai.", "Admin notes private rahenge."],
  },
  faq: [
    { q: "Partner registration free hai?", a: "Haan, bilkul free." },
    { q: "Commission kab milegi?", a: "Payment successful hone aur admin approve karne ke baad." },
    { q: "Approval me kitna time lagta hai?", a: "Generally 24-48 ghante." },
  ],
  finalCTA: { label: "Partner Registration Start Karein", href: "/partner/register" },
};

export const mockSafetyPageData: SafetyPageViewModel = {
  meta: { pageTitle: "Safety", pageDescription: "Privacy aur trust", mockMeta: makeMockMeta() },
  sections: [
    { title: "Privacy Commitment", content: "Aapki privacy hamari priority hai.", icon: "privacy" },
    { title: "Verified Profiles", content: "Profile completion se trust score better.", icon: "verified" },
    { title: "AI Nahi Banata Fake Data", content: "AI sirf aapke diye details use karta hai.", icon: "ai" },
    { title: "Partner Boundaries", content: "Partner sirf apne referred users ka limited status dekhta hai.", icon: "partner" },
    { title: "Payment Safety", content: "Payment encrypted gateway ke through hota hai.", icon: "payment" },
  ],
  report: { headline: "Kuch Galti Lagi?", description: "Suspicious activity dikhe to contact karein.", cta: { label: "Contact Support", href: "#" } },
};

function makeRegisterMock(ref?: string | null): RegisterPageViewModel {
  return {
    meta: { pageTitle: "Register", pageDescription: "Free account", mockMeta: makeMockMeta() },
    referralCode: ref ?? null,
    referralMessage: ref ? "Aap Partner referral se register kar rahe hain. Discount apply ho sakta hai." : undefined,
    fields: ["Full Name", "Mobile Number", "Email", "Password", "Confirm Password"],
    submitLabel: "Free Profile Banayein",
    loginLink: { label: "Already have account? Login", href: "/login" },
    partnerCTA: { label: "Partner banna chahte hain?", description: "Refer karein, commission earn karein.", href: "/partner/register" },
    privacyNote: "Aapka data safe hai.",
  };
}

export const mockRegisterPageData: RegisterPageViewModel = makeRegisterMock(null);

export function mockRegisterPageDataWithRef(ref?: string | null): RegisterPageViewModel {
  return makeRegisterMock(ref);
}

export const mockLoginPageData: LoginPageViewModel = {
  meta: { pageTitle: "Login", pageDescription: "Login karein", mockMeta: makeMockMeta() },
  fields: ["Mobile Number / Email", "Password"],
  submitLabel: "Login",
  registerLink: { label: "Account nahi hai? Register", href: "/register" },
  forgotPasswordLabel: "Password bhool gaye?",
  partnerCTA: { label: "Partner ho? Login karein", href: "/partner/register" },
  safetyNote: "Login details safe hain.",
};

export const mockPartnerRegisterData: PartnerRegisterViewModel = {
  meta: { pageTitle: "Partner Registration", pageDescription: "Register as partner", mockMeta: makeMockMeta() },
  hero: { headline: "Partner Registration", description: "Form bharein aur submit karein." },
  partnerTypes: [
    { value: "pandit", label: "Pandit Ji" },
    { value: "bureau", label: "Marriage Bureau" },
    { value: "consultant", label: "Rishta Consultant" },
    { value: "coordinator", label: "Community Coordinator" },
    { value: "family", label: "Family Reference Partner" },
    { value: "vendor", label: "Wedding Vendor" },
    { value: "other", label: "Other" },
  ],
  fields: ["Full Name", "Mobile Number", "Email (optional)", "City", "State", "Partner Type", "Organization Name (optional)", "Experience (optional)", "Expected Monthly Referrals (optional)", "Reference (optional)"],
  submitLabel: "Submit Application",
  pendingLink: { label: "Already applied? Check status", href: "/partner/pending" },
  approvalNote: "Admin review ke baad approval milega. 24-48 ghante lag sakte hain.",
};

export const mockPartnerPendingData: PartnerPendingViewModel = {
  meta: { pageTitle: "Pending", pageDescription: "Approval pending", mockMeta: makeMockMeta() },
  heading: "Partner Approval Pending",
  message: "Aapka partner account review me hai. Approval ke baad tools aur dashboard access milega.",
  explanation: "Admin application review kar raha hai. Generally 24-48 ghante lagte hain.",
  nextSteps: ["Admin application verify karega.", "Approval ke baad referral code milega.", "Phir members refer kar sakte hain."],
  primaryAction: { label: "Contact Support", href: "#" },
  secondaryAction: { label: "Back to Partner Program", href: "/partner-program" },
};
