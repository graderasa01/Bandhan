import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requirePartner } from "@/lib/auth/requirePartner";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/**
 * Error-correction level H and a 4-module quiet zone are not cosmetic here:
 * these get printed on cards and posters, then folded, smudged and photocopied.
 * H tolerates ~30% damage; anything lower stops scanning once it's been in a
 * pandit ji's pocket for a week.
 */
const QR_OPTIONS = {
  errorCorrectionLevel: "H" as const,
  margin: 4,
  color: { dark: "#3A2618", light: "#FFFFFF" },
};

export async function GET(req: Request) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) return response;

  const code = await prisma.referralCode.findFirst({
    where: { partnerId: partner.id, active: true },
    select: { code: true },
  });
  if (!code) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Abhi referral code nahi mila." }, { status: 404 });
  }

  const shareUrl = new URL(`/r/${code.code}`, req.url).toString();
  const format = new URL(req.url).searchParams.get("format") ?? "svg";

  if (format === "png") {
    const buffer = await QRCode.toBuffer(shareUrl, { ...QR_OPTIONS, type: "png", width: 1024 });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="bandhantak-${code.code}.png"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const svg = await QRCode.toString(shareUrl, { ...QR_OPTIONS, type: "svg" });
  return new NextResponse(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" },
  });
}
