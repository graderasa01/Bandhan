"use client";

import { useEffect, useState } from "react";
import { Feather, Moon, Sparkles, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHOTO_GLASS, ROOM_IDS, ROOM_LABEL, isRoomId, type RoomId } from "@/lib/theme/rooms";

const STORAGE_KEY = "bt-glass";

/**
 * The room switch — which of the product's four looks you are in.
 *
 *   terrace  Satin: the satin room, champagne and wine behind clear glass.
 *   ivory    Day: graphite and plum, neutral panes.
 *   gold     Night: lamp-lit, champagne bokeh.
 *   paper    Classic: cream paper, wine ink, gold rule — the look that shipped
 *            on bandhantak.com, and the one light room.
 *
 * Which of them this button offers is the admin's call (/admin/theme): a room
 * that is switched off is not in the cycle, and with only one room on there is
 * nothing to switch — globals.css hides the button (`.bt-room-toggle`) from
 * the first paint. The admin can also put a photo behind Satin, Day or Night;
 * a room with a photo wears the `/bolo` glass, which is why the glass this
 * writes is not always the room's own name.
 *
 * ## Why a cycle and not a menu
 *
 * This button sits in eight different headers, several of them a 40px slot in a
 * crowded bar, and a popover would have to be positioned correctly in every one
 * of them. A cycle needs no layer and no positioning, and at four stops it is
 * still three taps to anywhere. The label always names what the NEXT press
 * gives you, so nothing depends on recognising the current icon.
 *
 * It writes `data-room`, `data-glass` and `data-photo` on <html>, which every
 * token in the glass scope and `.photo-room` read; a cookie, which is what the
 * server renders from on the next navigation, so the room survives a full page
 * load; and localStorage, which the pre-paint script in app/layout.tsx reads
 * first. That script applies the same values before first paint — this only
 * has to stay in sync with it.
 */
const ICON: Record<RoomId, typeof Sun> = {
  terrace: Sparkles,
  ivory: Sun,
  gold: Moon,
  paper: Feather,
};

/** The comma lists the root layout writes onto <html>. */
function readRooms(value: string | undefined): RoomId[] {
  return (value ?? "").split(",").filter(isRoomId);
}

export default function ThemeToggle({ className }: { className?: string }) {
  // `terrace` and not `null`: the server renders that room by default, and a
  // first paint of the wrong icon is the one thing this component can get
  // visibly wrong. `mounted` still gates the icon, for the case where the
  // cookie says otherwise.
  const [room, setRoom] = useState<RoomId>("terrace");
  const [rooms, setRooms] = useState<RoomId[]>([...ROOM_IDS]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const root = document.documentElement;
    const on = readRooms(root.dataset.rooms);
    if (on.length > 0) setRooms(on);
    const current = root.dataset.room;
    if (isRoomId(current)) setRoom(current);
  }, []);

  const at = rooms.indexOf(room);
  const next = rooms[(at + 1) % rooms.length];

  function step() {
    setRoom(next);
    const root = document.documentElement;
    const photo = readRooms(root.dataset.photoRooms).includes(next);
    root.dataset.room = next;
    root.dataset.glass = photo ? PHOTO_GLASS : next;
    root.toggleAttribute("data-photo", photo);
    document.cookie = `bt-glass=${next};path=/;max-age=31536000;samesite=lax`;
    // Three of the four rooms are dark grounds, so the class stays on for them
    // and every `dark:` style in the app keeps applying. `paper` is the light
    // one and drops it — though the class alone is no longer what decides:
    // the `dark` variant is also gated on `data-glass` in globals.css, because
    // a dozen shells write `dark` into their own className and nothing here
    // can reach those.
    root.classList.toggle("dark", next !== "paper");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked — the room still applies for this session and the
         cookie still carries it to the next navigation */
    }
  }

  const Icon = ICON[room];

  return (
    <button
      type="button"
      onClick={step}
      aria-label={`${ROOM_LABEL[next]} theme on karein`}
      title={`${ROOM_LABEL[room]} theme — ${ROOM_LABEL[next]} par jaane ke liye tap karein`}
      className={cn(
        // `bt-room-toggle` is the hook globals.css hides the button by when
        // the admin has left only one room on.
        "bt-room-toggle",
        // visually 40px, 48px hit area (D-23)
        "touch-target grid size-10 place-items-center rounded-full border border-line bg-surface text-muted",
        "transition-colors hover:border-gold-500 hover:text-primary-text",
        "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        className,
      )}
    >
      {mounted ? <Icon className="size-[18px]" /> : <Sparkles className="size-[18px]" />}
    </button>
  );
}
