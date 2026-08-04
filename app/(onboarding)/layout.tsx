import type { ReactNode } from "react";
import { ProfileProvider } from "@/lib/profile/profileState";
import OnboardingShell from "@/components/layout/OnboardingShell";

/**
 * Route group for profile building. It shares no chrome with `/user/*` — the
 * dashboard is somewhere you arrive after a profile exists, not the frame you
 * build one inside.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <ProfileProvider>
      <OnboardingShell>{children}</OnboardingShell>
    </ProfileProvider>
  );
}
