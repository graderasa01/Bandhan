import { NextResponse } from "next/server";
import { getCurrentUser, touchSession } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/postLoginPath";
import { toUserDto } from "@/lib/auth/dto";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null, landing: null });

  // The one hook in the app that both runs on an ordinary visit and is allowed
  // to set a cookie. Middleware sees every request but runs on the Edge, where
  // Prisma can't reach the session row; Server Components can read the session
  // but cannot write a cookie back. So the sliding window is renewed here.
  await touchSession();

  // `landing` rides along so client components (PublicHeader) can offer "go
  // inside" without re-deriving a role → page mapping in the browser, where a
  // PARTNER's live status isn't visible at all.
  return NextResponse.json({ user: toUserDto(user), landing: await postLoginPath(user) });
}
