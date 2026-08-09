import "server-only";
import { BHAVA_MEANING, BHAVA_ORDINAL } from "./tables";
import type { KundliChart } from "@/lib/contracts/kundli";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * The printable kundli — a real PDF, written by hand, with no dependency.
 *
 * Three decisions worth naming, because each one looks like a shortcut and is
 * not:
 *
 *  - **No PDF library.** `pdfkit` was the obvious pick and was deliberately
 *    skipped: it loads its Type1 metrics (`.afm`) off disk at runtime, which is
 *    exactly the class of thing that works on a laptop and 500s inside a
 *    bundled Next.js server on Railway. What this file needs is a square, some
 *    straight lines and Helvetica text — PDF's own base-14 fonts cover all of
 *    it with nothing to embed, so the whole writer is ~120 lines of string
 *    building and one xref table.
 *  - **Latin-1 only, therefore Latin graha abbreviations.** The on-screen chart
 *    (`components/kundli/KundliChartSvg.tsx`) prints सू / चं / मं, which is what
 *    a family recognises. Devanagari in a PDF means embedding and subsetting a
 *    real font file, and there is none in the repo. Rather than ship boxes, the
 *    PDF uses Su / Ch / Ma and prints every full name in the table below the
 *    chart, so no glyph is the only place a value appears.
 *  - **Nothing here computes anything.** Every number printed comes off the
 *    `KundliChart` that `buildChart()` already produced from the real ephemeris.
 *    Where the chart says null — no lagna, no bhava — the PDF says so in words.
 *    There is no fallback value anywhere in this file, on purpose.
 */

const PAGE_W = 595.28; // A4 at 72dpi
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Ink colours, kept close to the app's wine/gold rather than pure black. */
const INK = "0.18 0.16 0.17";
const MUTED = "0.42 0.40 0.42";
const WINE = "0.42 0.09 0.20";
const GOLD = "0.68 0.53 0.20";
const RULE = "0.85 0.83 0.84";

/**
 * Latin-1 is the whole character set a base-14 font can address without
 * embedding, so anything outside it has to become something, not vanish
 * silently mid-word. The named cases are the ones this document actually
 * produces (curly quotes from copy, the degree sign on every graha row); the
 * final filter is the honest catch-all.
 */
function pdfText(raw: string): string {
  const mapped = raw
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/°/g, "°")
    .replace(/•/g, "-");
  let out = "";
  for (const ch of mapped) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 10 || code === 13) out += " ";
    else if (code >= 32 && code <= 255) out += ch;
  }
  return out.replace(/([\\()])/g, "\\$1");
}

/**
 * Coarse Helvetica advance widths, used only to centre and wrap text.
 *
 * A real AFM table would be 300 lines of data to make glyph positioning
 * pixel-exact; this affects where a label sits, never what it says, so a
 * per-character class is the right trade. Deliberately not exported — nothing
 * outside this file should be tempted to treat it as a measurement.
 */
function textWidth(s: string, size: number): number {
  let units = 0;
  for (const ch of s) {
    if (ch === " ") units += 278;
    else if (/[iljt.,:;'`|!]/.test(ch)) units += 250;
    else if (/[0-9]/.test(ch)) units += 556;
    else if (/[A-Z]/.test(ch)) units += 690;
    else if (/[mwMW]/.test(ch)) units += 833;
    else units += 545;
  }
  return (units / 1000) * size;
}

/** Greedy wrap on whole words, to a pt width. */
function wrap(s: string, size: number, maxW: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (textWidth(next, size) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A page under construction: a content stream and a downward-moving cursor. */
class Page {
  ops: string[] = [];
  y = PAGE_H - MARGIN;
}

class PdfDoc {
  pages: Page[] = [];
  page: Page;

  constructor() {
    this.page = new Page();
    this.pages.push(this.page);
  }

  /** Break to a fresh page when `needed` pt would run past the bottom margin. */
  ensure(needed: number) {
    if (this.page.y - needed < MARGIN + 24) {
      this.page = new Page();
      this.pages.push(this.page);
    }
  }

  text(
    s: string,
    opts: { size?: number; bold?: boolean; color?: string; x?: number; align?: "left" | "center" } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? "/F2" : "/F1";
    const body = pdfText(s);
    let x = opts.x ?? MARGIN;
    if (opts.align === "center") x = MARGIN + (CONTENT_W - textWidth(s, size)) / 2;
    this.page.ops.push(
      `BT ${font} ${size} Tf ${opts.color ?? INK} rg 1 0 0 1 ${x.toFixed(2)} ${(this.page.y - size).toFixed(2)} Tm (${body}) Tj ET`,
    );
  }

  /** Text plus the line advance — the normal way to add a paragraph line. */
  line(s: string, opts: Parameters<PdfDoc["text"]>[1] & { lead?: number } = {}) {
    const size = opts.size ?? 10;
    this.ensure(size + 6);
    this.text(s, opts);
    this.page.y -= opts.lead ?? size + 4;
  }

  paragraph(s: string, opts: { size?: number; color?: string } = {}) {
    const size = opts.size ?? 9;
    for (const l of wrap(s, size, CONTENT_W)) {
      this.line(l, { size, color: opts.color ?? MUTED, lead: size + 3 });
    }
  }

  gap(h: number) {
    this.page.y -= h;
  }

  rule(color = RULE) {
    this.ensure(8);
    this.page.ops.push(
      `q ${color} RG 0.7 w ${MARGIN} ${this.page.y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${this.page.y.toFixed(2)} l S Q`,
    );
    this.page.y -= 10;
  }

  raw(op: string) {
    this.page.ops.push(op);
  }

  /**
   * Serialise. Offsets are counted in characters and the buffer is written as
   * latin1, which is only sound because `pdfText` has already guaranteed every
   * text byte is <= 0xFF and the rest of the syntax is ASCII — one char, one
   * byte, so the xref table cannot drift.
   */
  build(): Buffer {
    const objects: string[] = [];
    const pageObjStart = 5; // 1 catalog, 2 pages, 3 F1, 4 F2
    const pageIds = this.pages.map((_, i) => pageObjStart + i * 2);

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

    this.pages.forEach((p, i) => {
      const id = pageIds[i];
      const stream = p.ops.join("\n");
      objects[id] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`;
      objects[id + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (let i = 1; i < objects.length; i++) {
      offsets[i] = out.length;
      out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objects.length; i++) {
      out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(out, "latin1");
  }
}

/**
 * House anchors, copied from `components/kundli/KundliChartSvg.tsx`.
 *
 * Same 300x300 space, same twelve anchors, same house->rashi rule below — so
 * the printed chart and the on-screen chart place every graha identically. Kept
 * as its own copy rather than imported because that file is a client component
 * in an SVG coordinate system (y down); this draws in PDF space (y up) and only
 * the anchor numbers are actually shared. If the SVG's anchors ever move, move
 * these too.
 */
const HOUSE_ANCHORS: ReadonlyArray<{ cx: number; cy: number }> = [
  { cx: 150, cy: 62 },
  { cx: 75, cy: 30 },
  { cx: 32, cy: 78 },
  { cx: 75, cy: 150 },
  { cx: 32, cy: 222 },
  { cx: 75, cy: 272 },
  { cx: 150, cy: 238 },
  { cx: 225, cy: 272 },
  { cx: 268, cy: 222 },
  { cx: 225, cy: 150 },
  { cx: 268, cy: 78 },
  { cx: 225, cy: 30 },
];

/** Latin stand-ins for the SVG's Devanagari — see this file's header. */
const GRAHA_SHORT: Record<string, string> = {
  Surya: "Su",
  Chandra: "Ch",
  Mangal: "Ma",
  Budh: "Bu",
  Guru: "Gu",
  Shukra: "Sk",
  Shani: "Sa",
  Rahu: "Ra",
  Ketu: "Ke",
};

/**
 * The North Indian diamond: outer square, both diagonals, and the diamond
 * through the four edge midpoints. Those three strokes are exactly the twelve
 * house polygons the SVG draws individually.
 */
function drawChart(doc: PdfDoc, chart: KundliChart, lagnaRashi: number, size: number) {
  doc.ensure(size + 16);
  const left = MARGIN + (CONTENT_W - size) / 2;
  const top = doc.page.y;
  const k = size / 300;
  // SVG y grows downward, PDF y grows upward.
  const px = (sx: number) => left + sx * k;
  const py = (sy: number) => top - sy * k;

  doc.raw(
    `q ${GOLD} RG 1.6 w ${px(0)} ${py(0)} m ${px(300)} ${py(0)} l ${px(300)} ${py(300)} l ${px(0)} ${py(300)} l h S Q`,
  );
  doc.raw(
    `q ${GOLD} RG 0.8 w ${px(0)} ${py(0)} m ${px(300)} ${py(300)} l S ` +
      `${px(300)} ${py(0)} m ${px(0)} ${py(300)} l S Q`,
  );
  doc.raw(
    `q ${GOLD} RG 0.8 w ${px(150)} ${py(0)} m ${px(300)} ${py(150)} l ` +
      `${px(150)} ${py(300)} l ${px(0)} ${py(150)} l h S Q`,
  );

  // Identical to the SVG: house n holds rashi (lagnaRashi + n - 1), wrapped.
  const byHouse: string[][] = HOUSE_ANCHORS.map(() => []);
  for (const g of chart.grahas) {
    const house = ((g.rashi - lagnaRashi + 12) % 12) + 1;
    byHouse[house - 1].push(GRAHA_SHORT[g.graha] ?? g.graha.slice(0, 2));
  }

  HOUSE_ANCHORS.forEach((h, i) => {
    const rashi = ((lagnaRashi + i - 1) % 12) + 1;
    const planets = byHouse[i];
    const cx = px(h.cx);
    const anchorY = py(h.cy) + (planets.length > 3 ? 16 : 10) * k;

    const numSize = 8;
    doc.raw(
      `BT /F2 ${numSize} Tf ${MUTED} rg 1 0 0 1 ${(cx - textWidth(String(rashi), numSize) / 2).toFixed(2)} ${anchorY.toFixed(2)} Tm (${rashi}) Tj ET`,
    );
    // Same stacking rule as the SVG: two columns once a house holds >3 grahas.
    planets.forEach((p, pi) => {
      const pSize = 8;
      const dx = planets.length > 3 ? (pi % 2 === 0 ? -17 : 17) * k : 0;
      const row = Math.floor(planets.length > 3 ? pi / 2 : pi);
      const y = anchorY - (13 + row * 11) * k;
      doc.raw(
        `BT /F2 ${pSize} Tf ${WINE} rg 1 0 0 1 ${(cx + dx - textWidth(p, pSize) / 2).toFixed(2)} ${y.toFixed(2)} Tm (${pdfText(p)}) Tj ET`,
      );
    });
  });

  doc.page.y = top - size - 6;
}

export interface KundliPdfSubject {
  name: string;
  /** The DOB the chart was computed from. Never null — no chart exists without it. */
  dateOfBirth: Date;
  /** Exactly as the user typed it, or null when they never filled it. */
  birthTime: string | null;
  birthPlace: string | null;
}

/** A four-column graha row, laid out on fixed tab stops. */
const COL = { graha: MARGIN, rashi: MARGIN + 92, nak: MARGIN + 210, bhava: MARGIN + 372 };

export function buildKundliPdf(chart: KundliChart, subject: KundliPdfSubject, t: Translate = noopT): Buffer {
  const doc = new PdfDoc();

  doc.line(t("kundliPdf.heading", "BandhanTak - Janm Kundli"), { size: 18, bold: true, color: WINE, lead: 24 });
  doc.line(subject.name, { size: 13, bold: true, lead: 16 });

  // Only the birth details that actually exist. A blank line beats a guess.
  const dob = subject.dateOfBirth.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  doc.line(`${t("kundliPdf.dobLabel", "Janm tithi:")} ${dob}`, { size: 9.5, color: MUTED, lead: 13 });
  if (subject.birthTime) {
    doc.line(`${t("kundliPdf.birthTimeLabel", "Janm samay:")} ${subject.birthTime}`, { size: 9.5, color: MUTED, lead: 13 });
  }
  if (chart.placeName ?? subject.birthPlace) {
    doc.line(`${t("kundliPdf.birthPlaceLabel", "Janm sthaan:")} ${chart.placeName ?? subject.birthPlace}`, {
      size: 9.5,
      color: MUTED,
      lead: 13,
    });
  }
  doc.gap(4);
  doc.rule();

  doc.line(t("kundliPdf.chandraRashi.title", "Chandra Rashi"), { size: 12, bold: true, color: WINE, lead: 16 });
  doc.line(
    `${t("kundliPdf.chandraRashi.rashiLabel", "Rashi:")} ${chart.chandra.rashiName}    ${t("kundliPdf.chandraRashi.nakshatraLabel", "Nakshatra:")} ${chart.chandra.nakshatraName}    ` +
      `${t("kundliPdf.chandraRashi.charanLabel", "Charan:")} ${chart.chandra.pada}    ${t("kundliPdf.chandraRashi.nakshatraLordLabel", "Nakshatra swami:")} ${chart.chandra.nakshatraLord}`,
    { size: 10, lead: 15 },
  );
  doc.paragraph(t("kundliPdf.chandraRashi.note", "Janm ke waqt Chandrama kahan tha - kundli milan isi se hota hai."));
  doc.gap(6);

  doc.line(t("kundliPdf.lagna.title", "Lagna"), { size: 12, bold: true, color: WINE, lead: 16 });
  if (chart.lagna) {
    doc.line(
      `${chart.lagna.rashiName} ${chart.lagna.degreeInRashi.toFixed(1)}°`,
      { size: 10, lead: 15 },
    );
  } else if (chart.precision === "no-time") {
    doc.paragraph(
      t(
        "kundliPdf.lagna.needTime",
        "Lagna is kundli me nahi hai, kyunki janm ka samay uplabdh nahi tha. Lagna har 4 minute me " +
          "ek degree badalta hai - bina samay ke uska andaaza lagana galat kundli banata hai, isliye " +
          "hum banate hi nahi. Chandra rashi aur guna milan phir bhi poori tarah sahi hain.",
      ),
    );
  } else {
    doc.paragraph(
      t(
        "kundliPdf.lagna.needPlace",
        "Lagna is kundli me nahi hai, kyunki janm-sthaan pehchana nahi ja saka. Lagna sthaan ke " +
          "deshantar par nirbhar hai. Sahi shehar ka naam profile me daalne par poori kundli ban jaayegi.",
      ),
    );
  }
  doc.gap(6);

  if (chart.lagna) {
    doc.line(t("kundliPdf.chart.title", "Janm Kundli (Uttar Bharatiya shaili)"), { size: 12, bold: true, color: WINE, lead: 16 });
    drawChart(doc, chart, chart.lagna.rashi, 250);
    doc.line(
      t(
        "kundliPdf.chart.legend",
        "Ghar ke andar ka number rashi hai. Graha sanket: Su Surya, Ch Chandra, Ma Mangal, Bu Budh, Gu Guru, Sk Shukra, Sa Shani, Ra Rahu, Ke Ketu.",
      ),
      { size: 7.5, color: MUTED, lead: 12 },
    );
    doc.gap(6);
  }

  doc.ensure(60);
  doc.line(t("kundliPdf.grahaTable.title", "Graha sthiti"), { size: 12, bold: true, color: WINE, lead: 16 });
  doc.text(t("kundliPdf.grahaTable.colGraha", "Graha"), { size: 8, bold: true, color: MUTED, x: COL.graha });
  doc.text(t("kundliPdf.grahaTable.colRashi", "Rashi"), { size: 8, bold: true, color: MUTED, x: COL.rashi });
  doc.text(t("kundliPdf.grahaTable.colNakshatra", "Nakshatra / charan"), { size: 8, bold: true, color: MUTED, x: COL.nak });
  doc.text(t("kundliPdf.grahaTable.colBhava", "Bhava"), { size: 8, bold: true, color: MUTED, x: COL.bhava });
  doc.page.y -= 12;
  doc.rule();

  const charanWord = t("kundliPdf.grahaTable.charanWord", "charan");
  for (const g of chart.grahas) {
    doc.ensure(16);
    doc.text(g.graha, { size: 9.5, bold: true, color: WINE, x: COL.graha });
    doc.text(`${g.rashiName} ${g.degreeInRashi.toFixed(1)}°${g.retrograde ? " (V)" : ""}`, {
      size: 9.5,
      x: COL.rashi,
    });
    doc.text(`${g.nakshatraName} - ${charanWord} ${g.pada}`, { size: 9.5, x: COL.nak });
    // `bhava` is null on every graha when there is no lagna — say so, don't blank it.
    doc.text(
      g.bhava === null ? "-" : `${g.bhava} (${BHAVA_MEANING[g.bhava - 1]})`,
      { size: 8.5, color: MUTED, x: COL.bhava },
    );
    doc.page.y -= 14;
  }
  if (chart.grahas.some((g) => g.retrograde)) {
    doc.gap(2);
    doc.line(t("kundliPdf.grahaTable.retrogradeNote", "(V) = vakri (retrograde)"), { size: 7.5, color: MUTED, lead: 12 });
  }
  doc.gap(8);

  // Word for word the same branch the screen uses, so a printed kundli and the
  // page can never disagree about a dosha.
  doc.ensure(70);
  doc.line(t("kundliPdf.manglik.title", "Mangal dosh"), { size: 12, bold: true, color: WINE, lead: 16 });
  doc.paragraph(
    chart.manglik.fromLagna === null
      ? `${t("kundliPdf.manglik.fromMoonPre", "Lagna ke bina poora nirnay nahi ho sakta. Chandra se dekhein to Mangal")} ${BHAVA_ORDINAL[chart.manglik.marsHouseFromMoon - 1]} ${t("kundliPdf.manglik.fromMoonMid", "bhav me hai -")} ${chart.manglik.fromMoon ? t("kundliPdf.manglik.yes", "ye manglik shreni me aata hai.") : t("kundliPdf.manglik.no", "ye manglik shreni me nahi aata.")}`
      : `${t("kundliPdf.manglik.fromLagnaPre", "Lagna se Mangal")} ${BHAVA_ORDINAL[(chart.manglik.marsHouseFromLagna ?? 1) - 1]} ${t("kundliPdf.manglik.fromLagnaMid", "bhav me hai aur Chandra se")} ${BHAVA_ORDINAL[chart.manglik.marsHouseFromMoon - 1]} ${t("kundliPdf.manglik.fromLagnaPost", "bhav me.")} ${
          chart.manglik.fromLagna
            ? t("kundliPdf.manglik.lagnaYes", "Lagna ke hisaab se ye manglik shreni me aata hai.")
            : t("kundliPdf.manglik.lagnaNo", "Lagna ke hisaab se ye manglik shreni me nahi aata.")
        }`,
    { color: INK },
  );
  doc.paragraph(
    t(
      "kundliPdf.manglik.disclaimer",
      "Mangal dosh ke kai nivaran (bhang) niyam hain jo poori kundli dekhe bina tay nahi hote. " +
        "Ye sirf sthiti bata raha hai, faisla nahi.",
    ),
  );
  doc.gap(10);

  doc.ensure(46);
  doc.rule();
  doc.paragraph(
    t(
      "kundliPdf.footer.ayanamsa",
      "Ganit Lahiri (Chitrapaksha) ayanamsa par hai, Chandra ki sthiti ek arc-minute se kam ke antar tak.",
    ),
    { size: 8 },
  );
  doc.paragraph(
    t(
      "kundliPdf.footer.disclaimer",
      "Ye asli ganit hai - par jyotish aur BandhanTak ki matching do alag cheezein hain, aur inme se " +
        "koi bhi doosre par asar nahi daalta.",
    ),
    { size: 8 },
  );

  return doc.build();
}

/** Safe, predictable download name — ASCII only, so no header encoding games. */
export function kundliPdfFilename(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `kundli-${slug || "bandhantak"}.pdf`;
}
