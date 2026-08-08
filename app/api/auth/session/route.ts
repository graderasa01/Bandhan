import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/postLoginPath";
import { toUserDto } from "@/lib/auth/dto";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null, landing: null });

  // `landing` rides along so client components (PublicHeader) can offer "go
  // inside" without re-deriving a role → page mapping in the browser, where a
  // PARTNER's live status isn't visible at all.
  return NextResponse.json({ user: toUserDto(user), landing: await postLoginPath(user) });
}
