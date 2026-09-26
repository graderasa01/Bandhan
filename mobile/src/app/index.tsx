import { Redirect } from "expo-router";
import { BootSplash } from "~/features/boot/BootSplash";
import { usePrefs } from "~/store/prefs";
import { useSession } from "~/store/session";

/**
 * The app's anchor route. It sends the member where they belong — the same
 * rule as the web's `landingPathForRole`: signed out → onboarding (first
 * launch) or welcome, an unfinished profile → Bolo, live → home — and is
 * where every guard change lands. The root layout only mounts the navigator
 * once the session is known, so the seal here is at most a single frame.
 */
export default function Splash() {
  const status = useSession((s) => s.status);
  const active = useSession((s) => s.user?.status === "ACTIVE");
  const onboardingSeen = usePrefs((s) => s.onboardingSeen);

  if (status === "signedOut") return <Redirect href={onboardingSeen ? "/welcome" : "/onboarding"} />;
  // An unfinished profile is finished in the conversation (Bolo), as on the web.
  if (status === "signedIn") return <Redirect href={active ? "/home" : "/bolo"} />;
  return <BootSplash />;
}
