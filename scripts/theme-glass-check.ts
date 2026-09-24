import { readFileSync } from "fs";
import path from "path";
import {
  BUILTIN_GLASS_PRESETS,
  DEFAULT_ROOM_GLASS,
  GLASS_CONTROLS,
  READABLE,
  SHIPPED_GLASS,
  autoBrightness,
  autoGlass,
  glassBody,
  glassReadability,
  glassVars,
  normalizeGlass,
  recommendDim,
  resolveGlass,
  type GlassValues,
} from "../lib/theme/glass";
import {
  DESKTOP_MIN_WIDTH,
  EMPTY_BACKGROUND,
  deviceView,
  roomDeviceVars,
  themeRoomCss,
  type RoomConfig,
  type RoomPhotoView,
} from "../lib/theme/rooms";

/**
 * The glass control on /admin/theme — pure logic, no database.
 *
 * Run: `npx tsx scripts/theme-glass-check.ts`
 *
 *   1. **Auto is the glass as it shipped.** The numbers auto hands a photo are
 *      the ones the photo room shipped with (pinned below from the measured
 *      photos), and every fallback in the CSS recipe is the same number — a
 *      page that loses the room's rule still gets the shipped glass.
 *   2. **Manual is final.** In manual mode the photo cannot move a single
 *      number: the admin's values reach the stylesheet untouched.
 *   3. **Desktop and mobile are independent.** Each device gets its own photo
 *      and its own glass, on its own side of the desktop media query; a device
 *      without a photo borrows the other's, with that photo's look.
 *   4. **Every knob is wired.** Each value `glassVars` writes is read by the
 *      stylesheet, and every stored value is clamped to its control's range.
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* The photos rooms have carried so far, with what the photo room recommended
   and chose for them before the glass control existed (the old `glassFor` and
   `recommendDim`, run side by side with the new ones over 17,586 photo/dim
   pairs with no difference). If one of these moves, auto has changed. */
const PINNED = [
  { name: "the first Satin photo (650×919)", lumaMean: 117.6, lumaBright: 226, dim: 0.32, brightness: 0.62 },
  { name: "a nature photo (1080×2400)", lumaMean: 88.7, lumaBright: 198.7, dim: 0.22, brightness: 0.62 },
  { name: "a bright photo (1080×2337)", lumaMean: 229, lumaBright: 242.2, dim: 0.53, brightness: 0.63 },
];

const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8").replace(/\r\n/g, "\n");

function photo(id: string, width: number, height: number, lumaMean: number, lumaBright: number): RoomPhotoView {
  return {
    id: id.padEnd(64, "0"),
    imageUrl: `/uploads/theme-rooms/${id}.webp`,
    backdropUrl: `/uploads/theme-rooms/${id}-backdrop.webp`,
    width,
    height,
    color: "#443322",
    lumaMean,
    lumaBright,
    recommendedDim: recommendDim({ lumaMean, lumaBright }),
  };
}

/** Every `--room-glass-*: value` pair in one rule body. */
function declarations(rule: string): Record<string, string> {
  return Object.fromEntries(
    [...rule.matchAll(/(--room-[a-z-]+):([^;}]+)/g)].map((m) => [m[1], m[2].trim()]),
  );
}

console.log("\n1. Auto is the glass as it shipped");
{
  for (const pinned of PINNED) {
    const luma = { lumaMean: pinned.lumaMean, lumaBright: pinned.lumaBright };
    const dim = recommendDim(luma);
    check(`recommended dim for ${pinned.name} is ${pinned.dim}`, dim === pinned.dim, `got ${dim}`);
    const brightness = autoBrightness(luma, dim);
    check(`auto brightness for ${pinned.name} is ${pinned.brightness}`, brightness === pinned.brightness, `got ${brightness}`);
    const auto = autoGlass(luma, dim);
    check(
      `auto changes nothing but brightness (${pinned.name})`,
      JSON.stringify({ ...auto, brightness: 0 }) === JSON.stringify({ ...SHIPPED_GLASS, brightness: 0 }),
    );
    check(
      `a room with no glass settings is auto (${pinned.name})`,
      JSON.stringify(resolveGlass(DEFAULT_ROOM_GLASS, "mobile", luma, dim)) === JSON.stringify(auto),
    );
  }

  const vars = glassVars(SHIPPED_GLASS);
  const fallbacks = Object.fromEntries(
    [...css.matchAll(/var\((--room-glass-[a-z-]+),\s*([^)]+)\)/g)].map((m) => [m[1], m[2].trim()]),
  );
  for (const [name, value] of Object.entries(vars)) {
    if (!(name in fallbacks)) continue;
    check(`CSS fallback ${name} is the shipped ${value}`, fallbacks[name] === value, `CSS says ${fallbacks[name]}`);
  }
  check(
    "shipped body ladder is the measured one",
    vars["--room-glass-alpha"] === "0.1" &&
      vars["--room-glass-alpha-soft"] === "0.08" &&
      vars["--room-glass-alpha-strong"] === "0.13" &&
      vars["--room-glass-alpha-hover"] === "0.17" &&
      vars["--room-glass-alpha-slab"] === "0.03",
    JSON.stringify(vars),
  );
}

console.log("\n2. Manual is final");
{
  const mine: GlassValues = { ...SHIPPED_GLASS, transparency: 55, blur: 6, brightness: 131, visibility: 40, tint: "#4a1119", tintStrength: 22 };
  const glass = { mode: "manual" as const, mobile: mine, desktop: SHIPPED_GLASS };
  const dark = { lumaMean: 30, lumaBright: 90 };
  const bright = { lumaMean: 230, lumaBright: 250 };
  check("manual values survive a dark photo", JSON.stringify(resolveGlass(glass, "mobile", dark, 0)) === JSON.stringify(mine));
  check("manual values survive a bright photo", JSON.stringify(resolveGlass(glass, "mobile", bright, 0.8)) === JSON.stringify(mine));
  check(
    "auto on the same photos does move",
    autoGlass(dark, 0).brightness !== autoGlass(bright, 0).brightness,
    `${autoGlass(dark, 0).brightness} vs ${autoGlass(bright, 0).brightness}`,
  );
  check(
    "switching back to auto keeps the manual numbers but stops using them",
    resolveGlass({ ...glass, mode: "auto" }, "mobile", bright, 0.8).brightness === autoGlass(bright, 0.8).brightness,
  );
  const vars = glassVars(mine);
  check("manual brightness reaches the page untouched", vars["--room-glass-brightness"] === "1.31");
  check("manual visibility becomes contrast()", vars["--room-glass-contrast"] === "0.4");
  check("manual blur reaches the page untouched", vars["--room-glass-blur"] === "6px");
  check("the tint colour is written as numbers, never as the raw string", !Object.values(vars).some((v) => v.includes("#")));
}

console.log("\n3. Desktop and mobile are independent");
{
  const phone = photo("phone", 1080, 2400, 88.7, 198.7);
  const wide = photo("wide", 2400, 1350, 140, 235);
  const room: RoomConfig = {
    id: "terrace",
    enabled: true,
    isDefault: true,
    mobile: { photo: phone, dim: 0.22, focusX: 50, focusY: 30 },
    desktop: { photo: wide, dim: 0.4, focusX: 70, focusY: 50 },
    glass: {
      mode: "manual",
      mobile: { ...SHIPPED_GLASS, blur: 12, transparency: 94 },
      desktop: { ...SHIPPED_GLASS, blur: 40, transparency: 70, brightness: 66 },
    },
  };
  const text = themeRoomCss(room);
  const [phoneRule, deskRule] = text.split(`@media (min-width:${DESKTOP_MIN_WIDTH}px)`);
  check("one rule for phones and one inside the desktop media query", Boolean(phoneRule && deskRule));
  const p = declarations(phoneRule);
  const d = declarations(deskRule);
  check("phone rule carries the phone photo", p["--room-photo"]?.includes("phone") ?? false, p["--room-photo"]);
  check("desktop rule carries the desktop photo", d["--room-photo"]?.includes("wide") ?? false, d["--room-photo"]);
  check("phone rule carries the phone blur", p["--room-glass-blur"] === "12px", p["--room-glass-blur"]);
  check("desktop rule carries the desktop blur", d["--room-glass-blur"] === "40px", d["--room-glass-blur"]);
  check("phone and desktop dims are their own", p["--room-dim"] === "0.22" && d["--room-dim"] === "0.4");
  check("a portrait photo is shown whole on a wide screen", p["--room-photo-wide-size"] === "contain");
  check("a landscape photo covers", d["--room-photo-wide-size"] === "cover" && d["--room-photo-wide-position"] === "70% 50%");

  const phoneOnly: RoomConfig = { ...room, desktop: EMPTY_BACKGROUND, glass: DEFAULT_ROOM_GLASS };
  const borrowed = deviceView(phoneOnly, "desktop");
  check("a desktop without a photo borrows the phone's, with its look", borrowed?.photo.id === phone.id && borrowed.dim === 0.22 && borrowed.own === false);
  const phoneOnlyDesk = declarations(themeRoomCss(phoneOnly).split("@media")[1] ?? "");
  check("…and shows it whole, as before desktops had their own", phoneOnlyDesk["--room-photo-wide-size"] === "contain");
  const deskOnly: RoomConfig = { ...room, mobile: EMPTY_BACKGROUND };
  check("a phone without a photo borrows the desktop's", deviceView(deskOnly, "mobile")?.photo.id === wide.id);
  check("a room with no photo writes no rule", themeRoomCss({ ...room, mobile: EMPTY_BACKGROUND, desktop: EMPTY_BACKGROUND }) === "");
  check("auto glass is worked out per device photo", roomDeviceVars({ ...room, glass: DEFAULT_ROOM_GLASS }, "desktop")?.["--room-glass-brightness"] === String(autoGlass(wide, 0.4).brightness / 100));
}

console.log("\n4. Every knob is wired, every value bounded");
{
  for (const name of Object.keys(glassVars(SHIPPED_GLASS))) {
    check(`the stylesheet reads ${name}`, css.includes(`var(${name}`));
  }
  const wild = normalizeGlass({ transparency: 400, blur: -3, brightness: "bright", tint: "red", shadowSpread: -90, saturation: 173 });
  check("out-of-range numbers are clamped", wild.transparency === 100 && wild.blur === 0 && wild.shadowSpread === -40);
  check("broken values fall back to the shipped ones", wild.brightness === SHIPPED_GLASS.brightness && wild.tint === SHIPPED_GLASS.tint);
  check("values snap to the control's step", wild.saturation === 175, String(wild.saturation));
  check("a knob missing from a stored row gets its shipped value", normalizeGlass({ blur: 9 }).edge === SHIPPED_GLASS.edge);
  const clear = glassBody({ ...SHIPPED_GLASS, transparency: 100, tintStrength: 0 });
  check("100% transparency is no body at all", [clear.alpha, clear.soft, clear.strong, clear.hover, clear.slab].every((a) => a === 0));
  const solid = glassBody({ ...SHIPPED_GLASS, transparency: 0 });
  check("0% transparency is solid", [solid.alpha, solid.soft, solid.strong, solid.hover, solid.slab].every((a) => a === 1));
  const smoke = glassBody({ ...SHIPPED_GLASS, transparency: 100, tint: "#000000", tintStrength: 30 });
  check("a tint on fully clear glass is the tint alone", smoke.alpha === 0.3 && smoke.rgb.join(" ") === "0 0 0");
  check(
    "the registry and the shipped values agree on every knob",
    GLASS_CONTROLS.every((c) => SHIPPED_GLASS[c.key] >= c.min && SHIPPED_GLASS[c.key] <= c.max),
  );
  for (const preset of BUILTIN_GLASS_PRESETS) {
    const inRange = GLASS_CONTROLS.every((c) => preset.values[c.key] >= c.min && preset.values[c.key] <= c.max);
    check(`preset "${preset.name}" is inside every range`, inRange);
    for (const pinned of PINNED) {
      const luma = { lumaMean: pinned.lumaMean, lumaBright: pinned.lumaBright };
      const dim = recommendDim(luma);
      const r = glassReadability(luma, dim, preset.values);
      check(
        `preset "${preset.name}" reads on ${pinned.name}`,
        r.average >= READABLE && r.bright >= READABLE,
        `${r.average.toFixed(2)} / ${r.bright.toFixed(2)}`,
      );
    }
  }
}

console.log(failures === 0 ? "\nAll glass checks passed." : `\n${failures} glass check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
