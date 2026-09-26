import { NextResponse } from "next/server";
import { getActiveTheme } from "@/lib/services/theme/siteThemeService";
import { getThemeRooms } from "@/lib/services/theme/themeRoomService";
import { ROOM_LABEL, canHavePhoto, deviceView, roomGlass } from "@/lib/theme/rooms";

export const runtime = "nodejs";

/**
 * The looks an admin configured on `/admin/theme`, as the native app needs
 * them: which rooms are on, which one is the default, and for each photo room
 * the *mobile* background (its portrait photo, or the desktop one it borrows,
 * with that photo's own dim and crop) and the glass resolved for mobile —
 * manual or auto, decided by the same `resolveGlass` the web's stylesheet
 * reads. The app only consumes these numbers; nothing here edits them.
 *
 * `brand` is the site-wide colour identity (`ThemeManager`, `siteThemeService`):
 * the pack, and for a CUSTOM pick the admin's five colours with the button
 * foregrounds already derived for contrast — the same values the web puts on
 * <html>. The app turns them into its semantic accent/signal tokens.
 *
 * Public, like the pages that apply it: the login screen wears the room too,
 * and nothing in it is member data.
 */
export async function GET() {
  const [theme, site] = await Promise.all([getThemeRooms(), getActiveTheme()]);

  const rooms = theme.rooms.map((room) => {
    const view = canHavePhoto(room.id) ? deviceView(room, "mobile") : null;
    return {
      id: room.id,
      label: ROOM_LABEL[room.id],
      enabled: theme.enabled.includes(room.id),
      background: view
        ? {
            imageUrl: view.photo.imageUrl,
            // The 72px blurred copy — what shows while the photo loads.
            backdropUrl: view.photo.backdropUrl,
            width: view.photo.width,
            height: view.photo.height,
            color: view.photo.color,
            dim: view.dim,
            focusX: view.focusX,
            focusY: view.focusY,
            /** False when the room has no portrait photo and the phone borrows the desktop one. */
            own: view.own,
          }
        : null,
      glass: view ? roomGlass(room, "mobile") : null,
      glassMode: view ? room.glass.mode : null,
    };
  });

  const vars = site.customVars;
  const brand = {
    pack: site.pack,
    custom: vars
      ? {
          primary: vars["--bt-primary"],
          primaryFg: vars["--bt-primary-fg"],
          primaryText: vars["--bt-primary-text"],
          accent: vars["--bt-accent"],
          accentFg: vars["--bt-accent-fg"],
          accentText: vars["--bt-accent-text"],
          signal: vars["--bt-trust"],
        }
      : null,
  };

  return NextResponse.json(
    { ok: true, defaultRoom: theme.defaultRoom, enabled: theme.enabled, rooms, brand },
    // Rooms change a few times a month; a minute is plenty and spares the DB
    // one read per app launch.
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
