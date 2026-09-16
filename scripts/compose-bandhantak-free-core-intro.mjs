import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

const root = process.cwd();
const adDir = path.join(root, "public", "ads", "reels", "free-core-intro");
const rawDir = path.join(adDir, "raw");
const frameDir = path.join(adDir, "frames");
const markPath = path.join(root, "public", "brand", "bandhantak-header-mark.svg");

const W = 1080;
const H = 1920;
const C = {
  wine: "#5b101b",
  wineDeep: "#3d0b13",
  gold: "#c59a3d",
  goldSoft: "#e2ca8e",
  ink: "#24191a",
  muted: "#6f6260",
  cream: "#fbf7ef",
  paper: "#fffdf8",
  green: "#19734f",
  greenSoft: "#e7f5ee",
  amber: "#a96717",
  amberSoft: "#fff3df",
  line: "#e7dcc8",
};

await fs.mkdir(frameDir, { recursive: true });

const mark64 = await sharp(markPath).resize(64, 64).png().toBuffer();
const mark92 = await sharp(markPath).resize(92, 92).png().toBuffer();

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function tspans(lines, x, y, size, lineHeight, attrs = "") {
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" ${attrs}>${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`)
    .join("")}</text>`;
}

function displayTspans(lines, x, y, size, lineHeight, fills) {
  return `<text x="${x}" y="${y}" font-family="Georgia, serif" font-size="${size}" font-weight="700">${lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}" fill="${fills[index] ?? fills.at(-1)}">${xml(line)}</tspan>`,
    )
    .join("")}</text>`;
}

function brandHeader(y = 70) {
  return `
    <text x="154" y="${y + 47}" font-family="Georgia, serif" font-size="42" font-weight="700" fill="${C.wine}">Bandhan<tspan fill="${C.gold}">Tak</tspan></text>
    <text x="154" y="${y + 72}" font-family="Arial, sans-serif" font-size="16" letter-spacing="1.2" fill="${C.muted}">RELATIONSHIPS BUILT ON TRUST</text>`;
}

function leafPattern(opacity = 0.34) {
  return `
    <g opacity="${opacity}" fill="none" stroke="${C.goldSoft}" stroke-width="2">
      <path d="M0 180 C110 150 132 84 182 0"/><path d="M54 155 C28 115 40 82 74 64"/><path d="M93 115 C80 77 96 47 132 32"/>
      <path d="M1080 1690 C964 1718 942 1804 895 1920"/><path d="M1022 1734 C1047 1770 1036 1805 1002 1826"/><path d="M982 1784 C997 1824 980 1853 946 1870"/>
    </g>`;
}

function photoShade({ top = 760, bottom = true } = {}) {
  return `
    <defs>
      <linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${C.cream}" stop-opacity="1"/>
        <stop offset="0.55" stop-color="${C.cream}" stop-opacity="0.88"/>
        <stop offset="1" stop-color="${C.cream}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${C.wineDeep}" stop-opacity="0"/>
        <stop offset="1" stop-color="${C.wineDeep}" stop-opacity="0.38"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="${top}" fill="url(#topShade)"/>
    ${bottom ? '<rect y="1540" width="1080" height="380" fill="url(#bottomShade)"/>' : ""}`;
}

function svgCanvas(body, background = "transparent") {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${background === "transparent" ? "" : `<rect width="${W}" height="${H}" fill="${background}"/>`}
    ${body}
  </svg>`);
}

async function photoFrame(rawName, outputName, overlayBody, extraComposites = []) {
  const overlay = svgCanvas(overlayBody);
  await sharp(path.join(rawDir, rawName))
    .resize(W, H, { fit: "cover", position: "centre" })
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: mark64, left: 72, top: 70 },
      ...extraComposites,
    ])
    .png()
    .toFile(path.join(frameDir, outputName));
}

await photoFrame(
  "shot-01-long-form-v1.png",
  "shot-01-long-form-v1.png",
  `${photoShade({ top: 820 })}${brandHeader()}
  <rect x="72" y="198" width="384" height="50" rx="25" fill="${C.paper}" stroke="${C.goldSoft}"/>
  <text x="96" y="232" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2" fill="${C.wine}">A BETTER FIRST STEP</text>
  ${displayTspans(["Matrimony shouldn't begin", "with a long form."], 72, 345, 69, 86, [C.wineDeep, C.gold])}
  ${tspans(["There is an easier, more human way."], 76, 555, 28, 38, `fill="${C.muted}"`)}
  <rect x="72" y="610" width="238" height="5" rx="3" fill="${C.gold}"/>
  <text x="72" y="1802" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#fff8eb">ONE SMALL QUESTION. ONE SIMPLE ANSWER.</text>`,
);

await photoFrame(
  "shot-02-speak-to-grio-v1.png",
  "shot-02-speak-to-grio-v1.png",
  `${photoShade({ top: 760 })}${brandHeader()}
  ${displayTspans(["Just speak.", "Your profile fills itself."], 72, 278, 68, 82, [C.wineDeep, C.gold])}
  <g transform="translate(72 470)">
    <rect width="936" height="270" rx="32" fill="${C.paper}" fill-opacity="0.95" stroke="${C.goldSoft}" stroke-width="2"/>
    <rect x="42" y="34" width="280" height="42" rx="21" fill="#f8f0df" stroke="${C.goldSoft}"/>
    <text x="64" y="62" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="${C.wine}">✦ WITH GRIO · 2 MINUTES</text>
    <text x="42" y="118" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="${C.ink}">8 short questions. No long form.</text>
    <rect x="42" y="148" width="852" height="72" rx="36" fill="${C.wine}"/>
    <circle cx="374" cy="184" r="16" fill="none" stroke="#fff8eb" stroke-width="3"/><path d="M374 166 V187 M364 183 C364 199 384 199 384 183 M374 199 V207" fill="none" stroke="#fff8eb" stroke-width="3" stroke-linecap="round"/>
    <text x="408" y="193" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#fff8eb">START TALKING</text>
    <text x="42" y="253" font-family="Arial, sans-serif" font-size="18" fill="${C.muted}">Type instead  ·  Upload biodata</text>
  </g>
  <text x="72" y="1812" font-family="Nirmala UI, Mangal, Arial, sans-serif" font-size="25" font-weight="700" fill="#fff8eb">“क्या बस बोलना है?”  ·  “हाँ, बिल्कुल।”</text>`,
);

const phoneUi = svgCanvas(`
  <rect x="0" y="0" width="238" height="524" rx="30" fill="${C.paper}"/>
  <rect x="82" y="12" width="74" height="14" rx="7" fill="#21191a"/>
  <text x="18" y="54" font-family="Georgia, serif" font-size="20" font-weight="700" fill="${C.wine}">Bandhan<tspan fill="${C.gold}">Tak</tspan></text>
  <text x="18" y="82" font-family="Arial, sans-serif" font-size="11" letter-spacing="1.2" fill="${C.muted}">PROFILE DRAFT</text>
  <rect x="14" y="97" width="210" height="76" rx="14" fill="#fff" stroke="${C.line}"/>
  <text x="28" y="120" font-family="Arial, sans-serif" font-size="9" letter-spacing="1" fill="${C.muted}">FULL NAME</text>
  <text x="28" y="146" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="${C.ink}">Rahul Sharma</text>
  <rect x="14" y="184" width="210" height="76" rx="14" fill="#fff" stroke="${C.line}"/>
  <text x="28" y="207" font-family="Arial, sans-serif" font-size="9" letter-spacing="1" fill="${C.muted}">EDUCATION</text>
  <text x="28" y="233" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${C.ink}">B.Tech · CS</text>
  <rect x="14" y="271" width="210" height="102" rx="14" fill="${C.amberSoft}" stroke="#efca94"/>
  <text x="28" y="295" font-family="Arial, sans-serif" font-size="9" letter-spacing="1" fill="${C.amber}">ANNUAL INCOME</text>
  <text x="28" y="322" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="${C.ink}">Couldn't be read</text>
  <text x="28" y="348" font-family="Arial, sans-serif" font-size="12" fill="${C.amber}">Missing — please fill</text>
  <rect x="14" y="390" width="210" height="54" rx="27" fill="${C.wine}"/>
  <text x="119" y="424" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#fff8eb">REVIEW &amp; CONFIRM</text>
  <text x="119" y="470" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="${C.muted}">Nothing is saved until</text>
  <text x="119" y="486" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="${C.muted}">you review it.</text>
`, "transparent");

await photoFrame(
  "shot-03-review-draft-v1.png",
  "shot-03-review-draft-v1.png",
  `${photoShade({ top: 790, bottom: false })}${brandHeader()}
  ${displayTspans(["AI drafts.", "You decide."], 72, 286, 72, 86, [C.wineDeep, C.gold])}
  ${tspans(["Every field stays under your control.", "If a detail is missing, AI leaves it missing."], 76, 492, 27, 40, `fill="${C.muted}"`)}
  <g transform="translate(70 790)">
    <rect width="470" height="230" rx="26" fill="${C.paper}" fill-opacity="0.94" stroke="${C.goldSoft}" stroke-width="2"/>
    <text x="34" y="52" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="1.6" fill="${C.wine}">THE RULE</text>
    <text x="34" y="100" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="${C.ink}">AI never invents</text>
    <text x="34" y="137" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="${C.ink}">profile details.</text>
    <text x="34" y="187" font-family="Arial, sans-serif" font-size="19" fill="${C.muted}">Review first. Save only when ready.</text>
  </g>`,
  [{ input: phoneUi, left: 628, top: 856 }],
);

const featureCards = [
  ["15", "matches / day"],
  ["60", "interests / month"],
  ["⌕", "Advanced Search"],
  ["◉", "Photos after adding yours"],
  ["PDF", "Kundli + guna milan + PDF"],
  ["6", "family seats"],
  ["10×", "Ask Grio / day"],
  ["✓", "Mobile, email & photo checks"],
];

const featureGrid = featureCards
  .map(([value, label], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 72 + col * 478;
    const y = 650 + row * 220;
    return `<g transform="translate(${x} ${y})">
      <rect width="432" height="176" rx="26" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>
      <circle cx="63" cy="63" r="36" fill="${C.greenSoft}"/>
      <text x="63" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="${C.green}">${xml(value)}</text>
      <text x="34" y="134" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${C.ink}">${xml(label)}</text>
    </g>`;
  })
  .join("");

const shot4Svg = svgCanvas(`
  <defs>
    <radialGradient id="paperGlow" cx="50%" cy="20%" r="80%"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#f6efe3"/></radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#paperGlow)"/>
  ${leafPattern(0.42)}${brandHeader()}
  <rect x="72" y="210" width="246" height="50" rx="25" fill="${C.greenSoft}"/>
  <text x="195" y="243" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="700" letter-spacing="2" fill="${C.green}">ALWAYS FREE</text>
  ${displayTspans(["Finding a match", "is free."], 72, 372, 78, 90, [C.wineDeep, C.gold])}
  ${tspans(["Profile, matches, interests, search, photos and kundli — ₹0."], 76, 585, 25, 36, `fill="${C.muted}"`)}
  ${featureGrid}
  <rect x="72" y="1585" width="936" height="126" rx="32" fill="${C.wine}"/>
  <text x="540" y="1640" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="#fff8eb">NO CARD. NO TRIAL.</text>
  <text x="540" y="1680" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#f2dfb3">Core access stays free.</text>
  <text x="540" y="1810" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" fill="${C.muted}">Live limits shown exactly as they are in the BandhanTak plan.</text>
`);
await sharp(shot4Svg).composite([{ input: mark64, left: 72, top: 70 }]).png().toFile(path.join(frameDir, "shot-04-free-core-v1.png"));

const verificationPanel = svgCanvas(`
  <rect x="0" y="0" width="512" height="690" rx="34" fill="${C.paper}" fill-opacity="0.97" stroke="${C.goldSoft}" stroke-width="2"/>
  <text x="34" y="56" font-family="Arial, sans-serif" font-size="19" font-weight="700" letter-spacing="1.8" fill="${C.wine}">VERIFICATION STATUS</text>
  ${[
    ["Mobile verified", true],
    ["Email verified", true],
    ["Photo checked", true],
    ["Identity", false],
    ["Education", false],
    ["Employment", false],
  ]
    .map(([label, done], index) => {
      const y = 92 + index * 78;
      return `<g transform="translate(26 ${y})">
        <rect width="460" height="62" rx="17" fill="${done ? C.greenSoft : "#f5f1ea"}"/>
        <circle cx="34" cy="31" r="15" fill="${done ? C.green : "#d5ccbe"}"/>
        <text x="34" y="38" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#fff">${done ? "✓" : "—"}</text>
        <text x="68" y="39" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="${C.ink}">${xml(label)}</text>
        <text x="432" y="39" text-anchor="end" font-family="Arial, sans-serif" font-size="15" fill="${done ? C.green : C.muted}">${done ? "CHECKED" : "NOT CHECKED"}</text>
      </g>`;
    })
    .join("")}
  <rect x="26" y="590" width="460" height="70" rx="18" fill="${C.amberSoft}"/>
  <text x="256" y="620" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="${C.amber}">WHAT ISN'T CHECKED</text>
  <text x="256" y="645" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="${C.ink}">stays visible — nothing is hidden.</text>
`, "transparent");

await photoFrame(
  "shot-05-verification-v1.png",
  "shot-05-verification-v1.png",
  `${photoShade({ top: 760 })}${brandHeader()}
  ${displayTspans(["No fake certainty.", "Every check is clear."], 72, 286, 67, 82, [C.wineDeep, C.gold])}
  ${tspans(["A badge says exactly what was checked —", "not whether someone is a perfect match."], 76, 492, 25, 38, `fill="${C.muted}"`)}
  <text x="72" y="1804" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#fff8eb">AI NEVER INVENTS PROFILE DETAILS.</text>`,
  [{ input: verificationPanel, left: 520, top: 735 }],
);

const shot6Svg = svgCanvas(`
  <defs>
    <radialGradient id="endGlow" cx="50%" cy="30%" r="78%"><stop offset="0" stop-color="#fffdf8"/><stop offset="0.7" stop-color="#f8f0e4"/><stop offset="1" stop-color="#eadbbf"/></radialGradient>
    <linearGradient id="wineFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.wine}"/><stop offset="1" stop-color="${C.wineDeep}"/></linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#endGlow)"/>
  ${leafPattern(0.6)}
  <circle cx="540" cy="370" r="205" fill="none" stroke="${C.goldSoft}" stroke-width="2" opacity="0.55"/>
  <circle cx="540" cy="370" r="155" fill="none" stroke="${C.gold}" stroke-width="2" opacity="0.35"/>
  <text x="540" y="580" text-anchor="middle" font-family="Georgia, serif" font-size="82" font-weight="700" fill="${C.wine}">Bandhan<tspan fill="${C.gold}">Tak</tspan></text>
  <text x="540" y="635" text-anchor="middle" font-family="Arial, sans-serif" font-size="21" letter-spacing="3" fill="${C.muted}">AI-GUIDED MATRIMONY BUILT FOR INDIA</text>
  ${displayTspans(["Real profiles.", "Clear reasons.", "Family included."], 118, 865, 78, 104, [C.wineDeep, C.wineDeep, C.gold])}
  <text x="540" y="1216" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${C.ink}">CREATE. SEARCH. MATCH. FREE.</text>
  <rect x="155" y="1310" width="770" height="112" rx="56" fill="url(#wineFade)"/>
  <text x="540" y="1380" text-anchor="middle" font-family="Arial, sans-serif" font-size="31" font-weight="700" fill="#fff8eb">CREATE FREE PROFILE</text>
  <text x="540" y="1512" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${C.wine}">bandhantak.com</text>
  <rect x="96" y="1610" width="888" height="128" rx="30" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>
  <text x="540" y="1661" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${C.ink}">PAY ONLY WHEN YOU CHOOSE TO OPEN</text>
  <text x="540" y="1695" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="${C.muted}">a mutual-match chat.</text>
  <text x="540" y="1840" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="${C.muted}">No marriage guarantee claim. Verification states are shown as checked or not checked.</text>
`);
await sharp(shot6Svg).composite([{ input: mark92, left: 494, top: 324 }]).png().toFile(path.join(frameDir, "shot-06-end-card-v1.png"));

const frameNames = [
  "shot-01-long-form-v1.png",
  "shot-02-speak-to-grio-v1.png",
  "shot-03-review-draft-v1.png",
  "shot-04-free-core-v1.png",
  "shot-05-verification-v1.png",
  "shot-06-end-card-v1.png",
];

const thumbW = 270;
const thumbH = 480;
const thumbs = await Promise.all(
  frameNames.map((name) => sharp(path.join(frameDir, name)).resize(thumbW, thumbH, { fit: "cover" }).png().toBuffer()),
);
const contactSheet = sharp({
  create: { width: thumbW * 3 + 80, height: thumbH * 2 + 110, channels: 4, background: C.cream },
}).composite(
  thumbs.map((input, index) => ({
    input,
    left: 20 + (index % 3) * (thumbW + 20),
    top: 55 + Math.floor(index / 3) * (thumbH + 20),
  })),
);
await contactSheet.png().toFile(path.join(adDir, "bandhantak-free-core-contact-sheet-v1.png"));

console.log(frameNames.map((name) => path.join(frameDir, name)).join("\n"));
console.log(path.join(adDir, "bandhantak-free-core-contact-sheet-v1.png"));
