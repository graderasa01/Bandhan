import type { HomePageViewModel, HowItWorksViewModel, PricingPageViewModel, PartnerProgramViewModel, SafetyPageViewModel, LoginPageViewModel, RegisterPageViewModel, PartnerRegisterViewModel, PartnerPendingViewModel } from "@/lib/contracts/publicPages";
import { makeMockMeta } from "@/lib/contracts/common";

export const mockHomePageData: HomePageViewModel = {
  meta: { pageTitle: "BandhanTak", pageDescription: "AI Powered Verified Matrimony & Partner Income Network", mockMeta: makeMockMeta() },
  hero: {
    headline: "BandhanTak — AI Powered Verified Matrimony",
    subheadline: "Yahaan har profile verified hai, har match ka apna reason hai — aur family shuru se aapke saath hai.",
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
      // `description` is overwritten with the live rate by getHomePageData() —
      // this literal is the shape, not the number. It used to be "₹100 har
      // renewal par", which went stale the moment commission became a
      // percentage.
      { title: "Lifetime Commission", description: "Har renewal par — jab tak aapka refer kiya user chalta rahe." },
    ],
    cta: { label: "Partner Registration →", href: "/partner-program" },
    // Always filled in by getHomePageData() from the live plan catalogue and
    // the live commission rate. `null` is the honest placeholder: commission is
    // a percentage of the plan price, so there is no rupee figure that can be
    // correctly written here.
    earnings: null,
  },
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
  // Placeholder only — `getPricingData` always overwrites both of these with
  // the live catalogue. `plans` used to borrow the home page's own (equally
  // empty) `pricingPreview`; the home page has no pricing section any more, so
  // it borrows nothing and says empty itself.
  plans: [],
  comparisonPlans: [],
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
    // D-12 (revised 2026-08-06): a PERCENTAGE of what the member paid, same
    // rate on every plan, and D-80 makes it recurring on every renewal. The
    // `commission` string here is always overwritten by
    // getPartnerProgramData() with the live config — never edit the number
    // here expecting it to show up on the page.
    example: { plan: "Koi bhi plan", commission: "Har payment par percentage — har renewal par bhi" },
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

/**
 * English mirrors of the mock copy above.
 *
 * These pages are almost entirely built from this file's data (not inline
 * JSX strings), so `t()` alone can't reach them — `getXPageData()` in
 * publicPageData.ts picks between the Hinglish object and its `*En` twin
 * based on the request's locale. Keep every shape identical to its Hinglish
 * counterpart (same keys, same array lengths) or the swap breaks silently.
 */
export const mockHomePageDataEn: HomePageViewModel = {
  meta: { pageTitle: "BandhanTak", pageDescription: "AI Powered Verified Matrimony & Partner Income Network", mockMeta: makeMockMeta() },
  hero: {
    headline: "BandhanTak — AI Powered Verified Matrimony",
    subheadline: "Every profile here is verified, every match has a reason — and family is with you from the start.",
    primaryCTA: { label: "Create Free Profile", href: "/register" },
    secondaryCTA: { label: "Become a Partner", href: "/partner-program" },
  },
  howItWorks: [
    { step: 1, title: "Create Your Profile", description: "Start your profile manually, through AI chat, or by uploading your biodata." },
    { step: 2, title: "Get AI Help", description: "AI will ask for missing details, write a draft, and improve it." },
    { step: 3, title: "Review & Submit", description: "Confirm your details, upload a photo, and complete your profile." },
    { step: 4, title: "Get Better Matches", description: "Smart matching with verified profiles, backed by a trust score." },
  ],
  trustCards: [
    { title: "AI Verified Profiles", description: "AI only works with the details you give it — it never invents data." },
    { title: "Privacy First", description: "Your data stays safe. A partner only sees limited status for the users they referred." },
    { title: "Partner Trusted", description: "Every partner is activated only after admin approval. The referral system is transparent." },
    { title: "Safe & Secure", description: "Payments are secure, the commission ledger is clear, privacy boundaries are strong." },
  ],
  aiProfileBuilder: {
    headline: "AI Helps You Complete Your Profile",
    description: "AI will ask you smart questions and fill in your details from your answers. You can also upload your biodata.",
    methods: [
      { title: "Build Your Profile with AI Chat", description: "AI will chat with you and fill in the details. Simple and guided.", icon: "chat" },
      { title: "Upload Your Biodata", description: "Upload your biodata as an image or PDF. AI will auto-fill the details.", icon: "upload" },
      { title: "Fill It In Manually", description: "Complete your profile yourself with a step-by-step form.", icon: "form" },
    ],
    cta: { label: "Build My Profile with AI", href: "/register" },
  },
  biodataAutofill: {
    headline: "Biodata Autofill — Save Time",
    description: "Upload your biodata as an image or PDF. AI fills in the details — you just review and confirm. Save time, get an accurate profile.",
    cta: { label: "Upload Biodata", href: "/register" },
  },
  verifiedProfile: {
    headline: "Verified Profiles — AI Guided, Not Fake",
    description: "AI only works with the details you give it and never invents missing data. Your trust score improves with profile completion and verification.",
    points: [
      "AI only uses the details you provide",
      "Partner-referred profiles carry an extra trust indicator",
      "Every profile can go through the verification process",
    ],
  },
  partnerPreview: {
    headline: "Become a BandhanTak Partner — Refer & Earn Commission",
    description: "Pandit Ji, marriage bureau, rishta consultant, or community coordinator? Refer members, help them get a subscription discount, and earn commission.",
    benefits: [
      { title: "Referral Link & QR", description: "Share your unique referral link and QR code." },
      { title: "Lead Dashboard", description: "Track the status of the users you referred." },
      { title: "Lifetime Commission", description: "On every renewal — for as long as the user you referred stays active." },
    ],
    cta: { label: "Partner Registration →", href: "/partner-program" },
    // Always filled in by getHomePageData() from the live plan catalogue and
    // the live commission rate. `null` is the honest placeholder: commission is
    // a percentage of the plan price, so there is no rupee figure that can be
    // correctly written here.
    earnings: null,
  },
  safetyPreview: {
    headline: "Your Privacy and Safety Are Our Priority",
    description: "Safety and trust are the foundation of BandhanTak.",
    points: [
      "AI only works with the data you give it. It never invents missing data.",
      "A partner only sees limited status for the users they referred.",
      "Verified profiles, partner boundaries, and a transparent system.",
    ],
  },
  finalCTA: {
    headline: "Create Your Verified Marriage Profile Now",
    description: "Build a verified profile on an AI-guided, safe, premium matrimony platform.",
    primaryCTA: { label: "Create Free Profile", href: "/register" },
    secondaryCTA: { label: "How It Works", href: "/how-it-works" },
  },
};

export const mockHowItWorksDataEn: HowItWorksViewModel = {
  meta: { pageTitle: "How It Works — BandhanTak", pageDescription: "Step-by-step process", mockMeta: makeMockMeta() },
  hero: { headline: "Start Your Matrimony Journey in 5 Steps", description: "AI guided, verified profiles, with a partner network." },
  steps: [
    { step: 1, title: "Create a Free Account", description: "Register with your mobile number or email.", icon: "1" },
    { step: 2, title: "Create Your Profile", description: "Manually, through AI chat, or by uploading your biodata.", icon: "2" },
    { step: 3, title: "Get AI Help", description: "AI will ask for missing details and improve your bio.", icon: "3" },
    { step: 4, title: "Review & Submit", description: "Review the details AI suggested.", icon: "4" },
    { step: 5, title: "Get Matches", description: "Verified matches, with partner discounts.", icon: "5" },
  ],
  finalCTA: { label: "Create Free Account", href: "/register" },
};

export const mockPricingDataEn: PricingPageViewModel = {
  meta: { pageTitle: "Pricing — BandhanTak", pageDescription: "Plans", mockMeta: makeMockMeta() },
  hero: { headline: "Simple, Transparent Pricing", description: "A discount is also available through partner referrals." },
  plans: [],
  comparisonPlans: [],
  partnerDiscountNote: "If you register through a partner referral, a discount may apply on eligible plans.",
  paymentSafetyNote: "The payment gateway is secure. Card details are never stored.",
  faq: [
    { q: "Is payment safe?", a: "Yes, payments go through a secure gateway." },
    { q: "Can I upgrade my plan?", a: "Absolutely — you can upgrade while your existing plan stays active." },
    { q: "How do I get a partner discount?", a: "Register through a verified partner's referral link." },
    { q: "Is there a free trial?", a: "Registration is free. You'll need a subscription to message." },
  ],
  finalCTA: { label: "Choose a Plan", href: "/register" },
};

export const mockPartnerProgramDataEn: PartnerProgramViewModel = {
  meta: { pageTitle: "Partner Program — BandhanTak", pageDescription: "Referral income", mockMeta: makeMockMeta() },
  hero: { headline: "Become a BandhanTak Partner — Refer & Earn", description: "Pandit Ji, marriage bureau, rishta consultant — refer genuine members and earn commission.", cta: { label: "Start Partner Registration", href: "/partner/register" } },
  whoCanBecome: {
    headline: "Who Can Become a Partner?", description: "Trusted people who can refer genuine members.",
    types: [
      { id: "pandit", title: "Pandit Ji", description: "Pandits who conduct weddings and religious ceremonies." },
      { id: "bureau", title: "Marriage Bureau", description: "Small marriage bureaus that can refer clients." },
      { id: "consultant", title: "Rishta Consultant", description: "Independent rishta consultants." },
      { id: "coordinator", title: "Community Coordinator", description: "Community or samaj coordinators." },
      { id: "family", title: "Family Reference Partner", description: "Families who can give referrals." },
      { id: "vendor", title: "Wedding Vendor", description: "Wedding photographers, mehendi artists." },
      { id: "other", title: "Other", description: "Any trusted person." },
    ],
  },
  howItWorks: [
    { step: 1, title: "Register as Partner", description: "Free registration. Admin will review it." },
    { step: 2, title: "Get Approved", description: "You'll get a referral code once approved." },
    { step: 3, title: "Get Referral Code", description: "Share your unique link and QR code." },
    { step: 4, title: "Share", description: "Share it on WhatsApp, SMS, or social media." },
    { step: 5, title: "Users Subscribe", description: "Referred users take a subscription." },
    { step: 6, title: "Earn Commission", description: "Commission is approved after admin verification." },
  ],
  benefits: [
    { title: "Referral Link & QR", description: "Share your unique link and QR code.", icon: "link" },
    { title: "Lead Dashboard", description: "Track the status of your referred users.", icon: "dashboard" },
    { title: "Commission Tracking", description: "Clear commission status on every subscription.", icon: "commission" },
    { title: "AI Partner Coach", description: "AI will tell you who to follow up with first.", icon: "ai" },
    { title: "Payout Status", description: "Track the status of your payout requests.", icon: "payout" },
  ],
  commissionTransparency: {
    headline: "Commission Transparency", description: "The system is simple and transparent.",
    example: { plan: "Any plan", commission: "A percentage on every payment — on every renewal too" },
    notes: ["Commission goes to pending right after a successful payment.", "It's approved after admin verification.", "Payout updates once admin approves it."],
  },
  approvalProcess: {
    headline: "Approval Process", description: "Approved after admin review.",
    steps: ["Submit your application.", "Admin reviews it within 24-48 hours.", "Your tools activate once approved."],
  },
  trustAndPrivacy: {
    headline: "Trust & Privacy",
    points: ["A partner is activated only after admin approval.", "A partner only sees limited status for the users they referred.", "Admin notes stay private."],
  },
  faq: [
    { q: "Is partner registration free?", a: "Yes, completely free." },
    { q: "When do I get my commission?", a: "After the payment succeeds and admin approves it." },
    { q: "How long does approval take?", a: "Usually 24-48 hours." },
  ],
  finalCTA: { label: "Start Partner Registration", href: "/partner/register" },
};

export const mockSafetyPageDataEn: SafetyPageViewModel = {
  meta: { pageTitle: "Safety", pageDescription: "Privacy and trust", mockMeta: makeMockMeta() },
  sections: [
    { title: "Privacy Commitment", content: "Your privacy is our priority.", icon: "privacy" },
    { title: "Verified Profiles", content: "Trust score improves with profile completion.", icon: "verified" },
    { title: "AI Doesn't Invent Fake Data", content: "AI only uses the details you give it.", icon: "ai" },
    { title: "Partner Boundaries", content: "A partner only sees limited status for the users they referred.", icon: "partner" },
    { title: "Payment Safety", content: "Payments go through an encrypted gateway.", icon: "payment" },
  ],
  report: { headline: "Something Feel Wrong?", description: "Contact us if you notice anything suspicious.", cta: { label: "Contact Support", href: "#" } },
};

function makeRegisterMockEn(ref?: string | null): RegisterPageViewModel {
  return {
    meta: { pageTitle: "Register", pageDescription: "Free account", mockMeta: makeMockMeta() },
    referralCode: ref ?? null,
    referralMessage: ref ? "You're registering through a partner referral. A discount may apply." : undefined,
    fields: ["Full Name", "Mobile Number", "Email", "Password", "Confirm Password"],
    submitLabel: "Create Free Profile",
    loginLink: { label: "Already have an account? Log in", href: "/login" },
    partnerCTA: { label: "Want to become a partner?", description: "Refer people, earn commission.", href: "/partner/register" },
    privacyNote: "Your data is safe.",
  };
}

export const mockRegisterPageDataEn: RegisterPageViewModel = makeRegisterMockEn(null);

export function mockRegisterPageDataWithRefEn(ref?: string | null): RegisterPageViewModel {
  return makeRegisterMockEn(ref);
}

export const mockLoginPageDataEn: LoginPageViewModel = {
  meta: { pageTitle: "Login", pageDescription: "Log in", mockMeta: makeMockMeta() },
  fields: ["Mobile Number / Email", "Password"],
  submitLabel: "Log In",
  registerLink: { label: "No account? Register", href: "/register" },
  forgotPasswordLabel: "Forgot password?",
  partnerCTA: { label: "Are you a partner? Log in", href: "/partner/register" },
  safetyNote: "Your login details are safe.",
};

export const mockPartnerRegisterDataEn: PartnerRegisterViewModel = {
  meta: { pageTitle: "Partner Registration", pageDescription: "Register as partner", mockMeta: makeMockMeta() },
  hero: { headline: "Partner Registration", description: "Fill out the form and submit it." },
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
  approvalNote: "You'll get approval after admin review. It can take 24-48 hours.",
};

export const mockPartnerPendingDataEn: PartnerPendingViewModel = {
  meta: { pageTitle: "Pending", pageDescription: "Approval pending", mockMeta: makeMockMeta() },
  heading: "Partner Approval Pending",
  message: "Your partner account is under review. You'll get access to tools and the dashboard once approved.",
  explanation: "Admin is reviewing your application. It usually takes 24-48 hours.",
  nextSteps: ["Admin will verify your application.", "You'll get a referral code once approved.", "Then you can start referring members."],
  primaryAction: { label: "Contact Support", href: "#" },
  secondaryAction: { label: "Back to Partner Program", href: "/partner-program" },
};
