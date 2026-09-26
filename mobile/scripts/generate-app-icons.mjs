import sharp from "sharp";
import { Buffer } from "node:buffer";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * The app's launcher, splash and notification art, rendered from the one
 * brand mark the web already uses (`public/brand/bandhantak-header-mark.svg`:
 * maroon seal, two interlocking gold-foil rings — "bandhan" = bond), the same
 * way `scripts/generate-pwa-icons.mjs` renders the PWA icons. No hand-drawn
 * second copy of the logo to drift.
 *
 * Run from the repository root (sharp comes from the web app's node_modules):
 *   node mobile/scripts/generate-app-icons.mjs
 */

const root = process.cwd();
const markSvg = await fs.readFile(path.join(root, "public", "brand", "bandhantak-header-mark.svg"), "utf8");
const out = path.join(root, "mobile", "assets", "images");
await fs.mkdir(out, { recursive: true });

const SEAL = "#4a1119";

/** The two rings alone, in one flat colour — for silhouettes (monochrome, notification). */
const rings = (color, stroke = 2.4) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="400" height="400">
    <circle cx="16" cy="20" r="7.5" fill="none" stroke="${color}" stroke-width="${stroke}" />
    <circle cx="24" cy="20" r="7.5" fill="none" stroke="${color}" stroke-width="${stroke}" />
  </svg>`;

/** The rings in gold foil on nothing — the adaptive icon's foreground and the splash mark. */
const foilRings = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="400" height="400">
    <defs>
      <linearGradient id="foil" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#e8cf7a" />
        <stop offset="45%" stop-color="#d4af37" />
        <stop offset="100%" stop-color="#94751f" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="20" r="7.5" fill="none" stroke="url(#foil)" stroke-width="2.25" />
    <circle cx="24" cy="20" r="7.5" fill="none" stroke="url(#foil)" stroke-width="2.25" opacity="0.8" />
  </svg>`;

async function centered(svg, canvas, scale, background) {
  const size = Math.round(canvas * scale);
  const art = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const offset = Math.round((canvas - size) / 2);
  const base = sharp({
    create: { width: canvas, height: canvas, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: art, left: offset, top: offset }]);
  return background ? base.flatten({ background }) : base;
}

// iOS / store icon: full-bleed and opaque — the OS applies its own mask.
await (await centered(markSvg, 1024, 0.86, SEAL)).png().toFile(path.join(out, "icon.png"));

// Android adaptive icon: the launcher crops to its own shape, so the rings sit
// inside the ~66% safe zone on a transparent layer over `backgroundColor`.
await (await centered(foilRings, 1024, 0.62)).png().toFile(path.join(out, "adaptive-icon.png"));
await (await centered(rings("#ffffff"), 1024, 0.62)).png().toFile(path.join(out, "adaptive-icon-monochrome.png"));

// Splash: the whole seal, centred by expo-splash-screen on the room colour.
await sharp(Buffer.from(markSvg)).resize(512, 512).png().toFile(path.join(out, "splash-icon.png"));

// Android status-bar notification icon: white silhouette on transparent.
await (await centered(rings("#ffffff", 3), 96, 0.9)).png().toFile(path.join(out, "notification-icon.png"));

// Web favicon.
await sharp(Buffer.from(markSvg)).resize(48, 48).png().toFile(path.join(out, "favicon.png"));

console.log(`Wrote app icons to ${path.relative(root, out)}`);
