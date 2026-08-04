import type { MatchesViewModel, InterestsViewModel } from "@/lib/contracts/discovery";
import { makeMockMeta } from "@/lib/contracts/common";

export const mockMatchesData: MatchesViewModel = {
  meta: makeMockMeta("mock"),
  matches: [
    { id: "m-001", displayName: "Demo User B", age: 26, city: "Demo City", education: "MBA", profession: "Marketing", trustScore: 85, verified: true, compatibility: 88, matchReason: "Mutual education background" },
    { id: "m-002", displayName: "Demo User C", age: 27, city: "Demo Town", education: "B.Com", profession: "Accountant", trustScore: 72, verified: false, compatibility: 65 },
    { id: "m-003", displayName: "Demo User D", age: 25, city: "Demo City", education: "M.Sc", profession: "Research", trustScore: 65, verified: true, compatibility: 72 },
  ],
  emptyState: { title: "Abhi suitable matches available nahi hain.", description: "Profile complete karein taaki better matches mil sakein." },
};

export const mockInterestsData: InterestsViewModel = {
  meta: makeMockMeta("mock"),
  received: [
    { id: "i-001", fromUser: { displayName: "Demo User E", age: 27, city: "Demo City" }, toUser: { displayName: "Demo User A" }, status: "RECEIVED", sentDate: "2026-01-15" },
  ],
  sent: [
    { id: "i-002", fromUser: { displayName: "Demo User A" }, toUser: { displayName: "Demo User F" }, status: "SENT", sentDate: "2026-01-14" },
  ],
  emptyReceived: { title: "Abhi koi interest nahi aaya hai.", description: "Profile complete karein taaki matches aapko find kar sakein." },
  emptySent: { title: "Abhi koi interest send nahi kiya hai.", description: "Matches explore karein aur interest bhejein." },
};
