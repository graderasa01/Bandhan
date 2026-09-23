"use client";

import { useEffect } from "react";
import { useGrio } from "./GrioProvider";

/**
 * Tells Grio which profile this page is showing — renders nothing.
 *
 * With it, opening Grio from the floating bubble on `/user/profile/[id]` starts
 * a conversation about *this* person (the entry point knows its context, the
 * same way the reel's card does), instead of a general chat that has to be
 * told who "is profile" means. Only the id and the display name travel; Grio's
 * server reads the rest itself, at the viewer's level.
 */
export default function GrioPageProfile({ profileId, name }: { profileId: string; name: string }) {
  const { setPageProfile } = useGrio();
  useEffect(() => {
    setPageProfile({ profileId, name, surface: "page" });
    return () => setPageProfile(null);
  }, [profileId, name, setPageProfile]);
  return null;
}
