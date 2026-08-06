import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { createOwnBiodataLink, createRishtaCardLink, createSochBoardLink, listShareLinks } from "@/lib/services/share/shareLinkService";
import type { ShareLinkRow } from "@/lib/services/share/shareLinkService";

export const runtime = "nodejs";

const BodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("OWN_BIODATA"), includeMobile: z.boolean().optional(), includeIncome: z.boolean().optional() }),
  z.object({ kind: z.literal("RISHTA_CARD"), profileId: z.string().min(1) }),
  z.object({ kind: z.literal("SOCH_BOARD") }),
]);

function withUrl(req: Request, link: ShareLinkRow) {
  const url = new URL(`/b/${link.token}`, new URL(req.url).origin).toString();
  return { ...link, url };
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const result =
    parsed.data.kind === "OWN_BIODATA"
      ? await createOwnBiodataLink(user.id, {
          includeMobile: parsed.data.includeMobile ?? false,
          includeIncome: parsed.data.includeIncome ?? false,
        })
      : parsed.data.kind === "RISHTA_CARD"
        ? await createRishtaCardLink(user.id, parsed.data.profileId)
        : await createSochBoardLink(user.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  const row: ShareLinkRow = {
    id: result.link.id,
    token: result.link.token,
    kind: result.link.kind,
    profileId: result.link.profileId,
    isActive: !result.link.revokedAt && result.link.expiresAt > new Date(),
    expiresAt: result.link.expiresAt.toISOString(),
    viewCount: result.link.viewCount,
    lastViewedAt: result.link.lastViewedAt?.toISOString() ?? null,
    createdAt: result.link.createdAt.toISOString(),
  };

  return NextResponse.json({ ok: true, link: withUrl(req, row) }, { status: 201 });
}

const QuerySchema = z.object({
  kind: z.enum(["OWN_BIODATA", "RISHTA_CARD", "SOCH_BOARD"]),
  profileId: z.string().optional(),
});

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    kind: searchParams.get("kind"),
    profileId: searchParams.get("profileId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "kind chahiye." }, { status: 422 });
  }

  const links = await listShareLinks(user.id, parsed.data);
  return NextResponse.json({ ok: true, links: links.map((l) => withUrl(req, l)) });
}
