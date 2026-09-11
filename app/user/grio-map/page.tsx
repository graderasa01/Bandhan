import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Grio Map",
};

/**
 * Retired address.
 *
 * The Samajh Map no longer has a page of its own — it was a map of the app on
 * a screen whose job was to hand the user to the app, and it came off the nav
 * and the profile builder's finish screen at the same time. Old links (nav
 * bookmarks, the dashboard's former Quick Action) land on the dashboard.
 *
 * `GrioSamajhMap` and `/api/grio/samajh-map` are untouched: the data behind
 * the map still feeds Grio itself, only this door is closed.
 */
export const dynamic = "force-dynamic";

export default function GrioMapPage() {
  redirect("/user/dashboard");
}
