import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth/requireUser";
import { getOrCreateMemberReferralCode } from "@/lib/services/referral/memberCode";
import { appOrigin } from "@/lib/utils/appOrigin";

export const runtime = "nodejs";

/**
 * Same error-correction level and quiet zone as the partner QR, and for the
 * same reason: this one gets shown off a phone screen at a family function and
 * scanned by an aunt holding her camera at an angle in bad light. H tolerates
 * ~30% loss; anything lower stops scanning the moment conditions are real.
 */
const QR_OPTIONS = {
  errorCorrectionLevel: "H" as const,
  margin: 4,
  color: { dark: "#3A2618", light: "#FFFFFF" },
};

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const code = await getOrCreateMemberReferralCode(user.id);
  const shareUrl = new URL(`/i/${code}`, appOrigin()).toString();
  const format = new URL(req.url).searchParams.get("format") ?? "svg";

  if (format === "png") {
    const buffer = await QRCode.toBuffer(shareUrl, { ...QR_OPTIONS, type: "png", width: 1024 });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="bandhantak-${code}.png"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const svg = await QRCode.toString(shareUrl, { ...QR_OPTIONS, type: "svg" });
  return new NextResponse(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" },
  });
}
