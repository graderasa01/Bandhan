import type { LucideIcon } from "lucide-react-native";
import { Bookmark, Eye, Heart, MessageCircle, Send } from "lucide-react-native";
import type { ReelLane } from "~/types/api";

/** Meri List's five lanes, in the web's order (`REEL_LANES`), with the web's words. */
export const LANES: ReelLane[] = ["VIEWED", "LIKED", "SHORTLIST", "INTEREST", "MESSAGE"];

export const LANE_ICON: Record<ReelLane, LucideIcon> = {
  VIEWED: Eye,
  LIKED: Heart,
  SHORTLIST: Bookmark,
  INTEREST: Send,
  MESSAGE: MessageCircle,
};

export const LANE_LABEL: Record<ReelLane, string> = {
  VIEWED: "Viewed",
  LIKED: "Liked",
  SHORTLIST: "Shortlist",
  INTEREST: "Interest",
  MESSAGE: "Messages",
};

/** What each lane holds — one line each, so a count never has to be guessed at. */
export const LANE_HINT: Record<ReelLane, string> = {
  VIEWED: "Dekhi, par kuch nahi kiya — dobara faisla karein",
  LIKED: "Private like — sirf aapko dikhta hai",
  SHORTLIST: "Saved — ghar me baat karne ke liye",
  INTEREST: "Jinhe aapne interest bheja",
  MESSAGE: "Jinse baat shuru ho chuki hai",
};

export function isLane(value: unknown): value is ReelLane {
  return typeof value === "string" && (LANES as string[]).includes(value);
}
