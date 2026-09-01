import {
  Briefcase,
  Camera,
  Coffee,
  Heart,
  Home,
  Sparkles,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FieldCategoryKey } from "@/lib/profile/fieldGroups";

/**
 * One mark per profile section.
 *
 * Shared because two surfaces name the same eight sections and have to agree:
 * the swipe deck's question cards (ManualProfileFormMobile) and the
 * dashboard's "Your Profile" list (ProfileOverviewCard). Two copies is how the
 * deck ends up showing a coffee cup for a section the dashboard drew a house
 * for, and a user stops trusting the mark to mean anything.
 */
export const CATEGORY_ICON: Record<FieldCategoryKey, LucideIcon> = {
  basics: User,
  career: Briefcase,
  family: Home,
  background: Users,
  lifestyle: Coffee,
  partner: Heart,
  kundli: Sparkles,
  photos: Camera,
};
